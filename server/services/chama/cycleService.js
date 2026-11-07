// server/services/chama/cycleService.js
//
// End-of-cycle processing, reminders and the monthly PDF report.
// Rules (note defaults): fines are fine_percent of the shortfall against the
// member's prorated expected amount; no grace period.
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { pool } = require("../../config/db");
const { telegramNotify, telegramSendDocument } = require("../../queues/notify");
const repo = require("./chamaRepo");
const chamaService = require("./chamaService");

const toDateOnly = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const addDays = (days) => new Date(Date.now() + days * 86400000);

async function processCycles() {
  const today = new Date().getDate();
  const chamas = await repo.listChamasByCycleDay(today);

  for (const chama of chamas) {
    try {
      await closeAndOpenCycle(chama);
    } catch (err) {
      console.error(
        `Cycle processing failed for ${chama.chat_id}:`,
        err.message,
      );
    }
  }
}

async function closeAndOpenCycle(chama) {
  const client = await pool.connect();
  let summary = null;

  try {
    await client.query("BEGIN");

    const { rows: cycleRows } = await client.query(
      `SELECT * FROM cycles WHERE chama_id = $1 AND status = 'open' FOR UPDATE`,
      [chama.chat_id],
    );
    const currentCycle = cycleRows[0];

    if (!currentCycle) {
      // First-ever cycle for this chama.
      await client.query(
        `INSERT INTO cycles (chama_id, period_start, period_end, expected_total_cents)
         VALUES ($1, $2, $3, 0)`,
        [chama.chat_id, toDateOnly(new Date()), toDateOnly(addDays(30))],
      );
      await client.query("COMMIT");
      return;
    }

    const { rows: members } = await client.query(
      `SELECT m.user_id, m.name, m.joined_at,
              COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'confirmed'), 0)::int AS contributed
       FROM chama_members m
       LEFT JOIN contributions c
         ON c.member_user_id = m.user_id AND c.cycle_id = $1
       WHERE m.chama_id = $2 AND m.left_at IS NULL
       GROUP BY m.user_id, m.name, m.joined_at`,
      [currentCycle.id, chama.chat_id],
    );

    let totalCollected = 0;
    const shortfalls = [];
    const memberRows = [];

    for (const m of members) {
      totalCollected += m.contributed;
      const expected = chamaService.expectedForMember(chama, currentCycle, m);
      const shortfall = expected - m.contributed;

      let fine = 0;
      if (shortfall > 0) {
        fine = Math.round(shortfall * (Number(chama.fine_percent) / 100));
        await client.query(
          `INSERT INTO fines (cycle_id, member_user_id, amount_cents, reason)
           VALUES ($1, $2, $3, $4)`,
          [
            currentCycle.id,
            m.user_id,
            fine,
            `Shortfall on cycle ${toDateOnly(new Date(currentCycle.period_start))}`,
          ],
        );
        shortfalls.push({ name: m.name, shortfall, fine });
      }

      memberRows.push({
        name: m.name,
        contributed: m.contributed,
        expected,
        fine,
        late: shortfall > 0,
      });
    }

    await client.query(`UPDATE cycles SET status = 'closed' WHERE id = $1`, [
      currentCycle.id,
    ]);

    // Expected total for the new cycle: each current member's full amount.
    // Guard: if the cycle is being closed on the same day it started (manual
    // same-day close), start the next one tomorrow so (chama_id, period_start)
    // stays unique.
    const oldStart = new Date(currentCycle.period_start).getTime();
    const newStart = new Date(
      Math.max(Date.now(), oldStart + 86400000),
    );
    const newEnd = new Date(newStart.getTime() + 30 * 86400000);
    const newCycleLike = {
      period_start: newStart,
      period_end: newEnd,
    };
    const expectedTotal = members.reduce(
      (sum, m) =>
        sum +
        chamaService.expectedForMember(chama, newCycleLike, {
          joined_at: m.joined_at,
        }),
      0,
    );

    await client.query(
      `INSERT INTO cycles (chama_id, period_start, period_end, expected_total_cents)
       VALUES ($1, $2, $3, $4)`,
      [chama.chat_id, toDateOnly(newStart), toDateOnly(newEnd), expectedTotal],
    );

    await client.query("COMMIT");

    const treasurerMember = members.find(
      (m) => m.user_id === chama.treasurer_user_id,
    );

    summary = {
      currentCycle,
      totalCollected,
      shortfalls,
      memberRows,
      memberCount: members.length,
      expectedTotal: currentCycle.expected_total_cents,
      monthlyAmount: chama.monthly_amount_cents,
      finePercent: Number(chama.fine_percent),
      treasurerName: (treasurerMember && treasurerMember.name) || "Treasurer",
      generatedAt: new Date(),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  if (!summary) return;

  // Side effects happen only after the transaction commits; messaging
  // failures must not fail the API call (the data is already committed).
  try {
    await sendCycleSummary(chama, summary);
  } catch (err) {
    console.error("Cycle summary failed:", err.message);
  }

  try {
    const pdfPath = await generateMonthlyPdf(chama, summary);
    await telegramSendDocument(chama.treasurer_user_id, pdfPath, {
      filename: path.basename(pdfPath),
      priority: 3,
      jobId: `cycle-pdf-${summary.currentCycle.id}`,
    });
  } catch (err) {
    console.error("Cycle PDF failed:", err.message);
  }
}

async function sendCycleSummary(
  chama,
  { currentCycle, totalCollected, shortfalls, memberCount },
) {
  const lines = [
    `Cycle ${currentCycle.period_start} closed.`,
    `Total collected: KSh ${(totalCollected / 100).toLocaleString()}`,
    `Members on time: ${memberCount - shortfalls.length} / ${memberCount}`,
  ];

  if (shortfalls.length > 0) {
    lines.push("", "Late members:");
    for (const s of shortfalls) {
      lines.push(
        `- ${s.name}: KSh ${(s.shortfall / 100).toLocaleString()} short (fine KSh ${(s.fine / 100).toLocaleString()})`,
      );
    }
  }

  lines.push("", "A new cycle has been opened.");
  await telegramNotify(chama.chat_id, lines.join("\n"), {
    priority: 3,
    jobId: `cycle-summary-${currentCycle.id}`,
  });
}

async function sendCycleReminders() {
  const tomorrow = new Date(Date.now() + 86400000).getDate();
  const chamas = await repo.listChamasByCycleDay(tomorrow);

  for (const chama of chamas) {
    const cycle = await repo.findOpenCycle(chama.chat_id);
    if (!cycle) continue;

    const members = await repo.listActiveMembers(chama.chat_id);
    const late = [];

    for (const m of members) {
      const contributed = await repo.getMemberCycleConfirmed(
        cycle.id,
        m.user_id,
      );
      const expected = chamaService.expectedForMember(chama, cycle, m);
      if (contributed < expected) {
        late.push({ ...m, contributed, expected });
      }
    }

    if (late.length === 0) continue;

    await telegramNotify(
      chama.chat_id,
      `Tomorrow is cycle day. These members still need to contribute:\n` +
        late.map((m) => `- ${m.name}`).join("\n") +
        `\n\nType /contribute now to avoid fines.`,
      { priority: 3, jobId: `cycle-reminder-${cycle.id}` },
    );

    for (const m of late) {
      await telegramNotify(
        m.user_id,
        `Hi ${m.name}, reminder: tomorrow is the cycle day for ${chama.name}. Run /contribute to pay in.`,
        {
          priority: 5,
          jobId: `cycle-reminder-${cycle.id}-${m.user_id}`,
          // 403 = no private chat with the bot -> fall back to a group mention.
          fallback: {
            chatId: chama.chat_id,
            text: `<a href="tg://user?id=${m.user_id}">${m.name}</a>, your contribution is overdue.`,
            opts: { parse_mode: "HTML" },
          },
        },
      );
    }
  }
}

const FONT_DIR = "/usr/share/fonts/liberation-sans-fonts";

const PDF_COLORS = {
  emerald: "#059669",
  emeraldDark: "#047857",
  emeraldBg: "#ecfdf5",
  slate900: "#0f172a",
  slate600: "#475569",
  slate500: "#64748b",
  slate200: "#e2e8f0",
  slate100: "#f1f5f9",
  slate50: "#f8fafc",
  red: "#dc2626",
  redBg: "#fef2f2",
  white: "#ffffff",
};

async function generateMonthlyPdf(chama, report) {
  const {
    currentCycle,
    totalCollected,
    shortfalls = [],
    memberRows = [],
    memberCount = memberRows.length,
    expectedTotal = 0,
    monthlyAmount = 0,
    finePercent = 0,
    treasurerName = "Treasurer",
    generatedAt = new Date(),
  } = report;

  const dir = path.join(__dirname, "..", "..", "reports");
  fs.mkdirSync(dir, { recursive: true });

  const safeName =
    String(chama.name)
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "") || String(chama.chat_id);
  const periodLabel = toDateOnly(new Date(currentCycle.period_start));
  const file = path.join(dir, `${safeName}-${periodLabel}.pdf`);

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, bottom: 56, left: 40, right: 40 },
    bufferPages: true,
  });
  const stream = fs.createWriteStream(file);
  doc.pipe(stream);

  // Prefer an embedded font; fall back to pdfkit built-ins.
  let fonts = {
    regular: "Helvetica",
    bold: "Helvetica-Bold",
  };
  const regularPath = path.join(FONT_DIR, "LiberationSans-Regular.ttf");
  if (fs.existsSync(regularPath)) {
    doc.registerFont("body", regularPath);
    doc.registerFont("body-bold", path.join(FONT_DIR, "LiberationSans-Bold.ttf"));
    fonts = { regular: "body", bold: "body-bold" };
  }

  const C = PDF_COLORS;
  const money = (cents) => `KSh ${(Number(cents) / 100).toLocaleString("en-KE")}`;
  const fmtDate = (d) =>
    new Date(d).toLocaleDateString("en-KE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const M = 40;
  const contentW = pageW - M * 2;
  const totalFines = shortfalls.reduce((sum, f) => sum + f.fine, 0);
  const onTime = memberCount - shortfalls.length;
  const pct =
    expectedTotal > 0
      ? Math.min(100, Math.round((totalCollected / expectedTotal) * 100))
      : 0;

  /* ---------------- Header band ---------------- */
  doc.rect(0, 0, pageW, 96).fill(C.emerald);

  const initials =
    String(chama.name)
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "CH";

  doc.roundedRect(M, 26, 44, 44, 10).fill(C.white);
  doc
    .font(fonts.bold)
    .fontSize(16)
    .fillColor(C.emerald)
    .text(initials, M, 40, { width: 44, align: "center" });

  doc
    .font(fonts.bold)
    .fontSize(19)
    .fillColor(C.white)
    .text(chama.name, M + 58, 30, { width: contentW - 230 });
  doc
    .font(fonts.regular)
    .fontSize(10)
    .fillColor("#d1fae5")
    .text("Monthly Cycle Report", M + 58, 55);

  doc
    .font(fonts.regular)
    .fontSize(10)
    .fillColor(C.white)
    .text(
      `${fmtDate(currentCycle.period_start)} → ${fmtDate(currentCycle.period_end)}`,
      M,
      34,
      { width: contentW, align: "right" },
    )
    .fillColor("#d1fae5")
    .text(`Generated ${fmtDate(generatedAt)}`, M, 50, {
      width: contentW,
      align: "right",
    });

  let y = 118;

  /* ---------------- Meta line ---------------- */
  doc
    .font(fonts.regular)
    .fontSize(9)
    .fillColor(C.slate600)
    .text(
      `${money(monthlyAmount)} per cycle · cycle day ${chama.cycle_day} · fines ${finePercent}% · Treasurer: ${treasurerName}`,
      M,
      y,
      { width: contentW },
    );
  y += 24;

  /* ---------------- Summary cards ---------------- */
  const gap = 12;
  const cardW = (contentW - gap * 2) / 3;
  const cardH = 88;

  function drawCard(x, label, value, sub, accent) {
    doc
      .roundedRect(x, y, cardW, cardH, 8)
      .fillAndStroke(C.slate50, C.slate200);
    doc
      .font(fonts.bold)
      .fontSize(8)
      .fillColor(C.slate500)
      .text(label.toUpperCase(), x + 12, y + 12, {
        width: cardW - 24,
        characterSpacing: 0.6,
      });
    doc
      .font(fonts.bold)
      .fontSize(15)
      .fillColor(accent)
      .text(value, x + 12, y + 26, { width: cardW - 24 });
    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor(C.slate500)
      .text(sub, x + 12, y + 47, { width: cardW - 24 });
  }

  drawCard(
    M,
    "Collected",
    money(totalCollected),
    `of ${money(expectedTotal)} expected`,
    C.emeraldDark,
  );

  const barX = M + 12;
  const barW = cardW - 24;
  doc.roundedRect(barX, y + 66, barW, 6, 3).fill(C.slate100);
  if (pct > 0) {
    doc
      .roundedRect(barX, y + 66, Math.max(4, (barW * pct) / 100), 6, 3)
      .fill(C.emerald);
  }
  doc
    .font(fonts.regular)
    .fontSize(7)
    .fillColor(C.slate500)
    .text(`${pct}%`, barX, y + 75, { width: barW, align: "right" });

  drawCard(
    M + cardW + gap,
    "Members paid",
    `${onTime} / ${memberCount}`,
    `${memberCount - onTime} outstanding`,
    C.slate900,
  );
  drawCard(
    M + (cardW + gap) * 2,
    "Fines issued",
    money(totalFines),
    `${shortfalls.length} member${shortfalls.length === 1 ? "" : "s"}`,
    shortfalls.length > 0 ? C.red : C.slate900,
  );
  y += cardH + 28;

  /* ---------------- Members table ---------------- */
  const colMember = M + 8;
  const colStatus = M + 178;
  const rightContributed = M + 330;
  const rightExpected = M + 420;
  const rightFine = M + contentW - 8;

  function drawTableHeader(yy) {
    doc.rect(M, yy, contentW, 24).fill(C.slate900);
    doc.font(fonts.bold).fontSize(8).fillColor(C.white);
    doc.text("MEMBER", colMember, yy + 8);
    doc.text("STATUS", colStatus, yy + 8);
    doc.text("CONTRIBUTED", M, yy + 8, {
      width: rightContributed - M - 6,
      align: "right",
    });
    doc.text("EXPECTED", M, yy + 8, {
      width: rightExpected - M - 6,
      align: "right",
    });
    doc.text("FINE", M, yy + 8, { width: rightFine - M, align: "right" });
    return yy + 24;
  }

  doc.font(fonts.bold).fontSize(11).fillColor(C.slate900).text("MEMBERS", M, y);
  y += 18;
  y = drawTableHeader(y);

  memberRows.forEach((m, i) => {
    if (y > pageH - 90) {
      doc.addPage();
      y = drawTableHeader(M);
    }

    const rowH = 22;
    if (m.late) {
      doc.rect(M, y, contentW, rowH).fill(C.redBg);
    } else if (i % 2 === 1) {
      doc.rect(M, y, contentW, rowH).fill(C.slate50);
    }

    doc
      .font(fonts.regular)
      .fontSize(9)
      .fillColor(C.slate900)
      .text(m.name, colMember, y + 6, { width: 160, ellipsis: true });

    const chipW = m.late ? 34 : 26;
    doc
      .roundedRect(colStatus, y + 4, chipW, 14, 7)
      .fill(m.late ? C.redBg : C.emeraldBg);
    doc
      .font(fonts.bold)
      .fontSize(7)
      .fillColor(m.late ? C.red : C.emeraldDark)
      .text(m.late ? "LATE" : "OK", colStatus, y + 8, {
        width: chipW,
        align: "center",
      });

    doc
      .font(fonts.regular)
      .fontSize(9)
      .fillColor(C.slate900)
      .text(money(m.contributed), M, y + 6, {
        width: rightContributed - M - 6,
        align: "right",
      });
    doc.fillColor(C.slate600).text(money(m.expected), M, y + 6, {
      width: rightExpected - M - 6,
      align: "right",
    });
    doc
      .fillColor(m.fine > 0 ? C.red : C.slate600)
      .text(money(m.fine), M, y + 6, {
        width: rightFine - M,
        align: "right",
      });

    y += rowH;
  });

  if (y > pageH - 90) {
    doc.addPage();
    y = drawTableHeader(M);
  }
  doc.moveTo(M, y).lineTo(M + contentW, y).strokeColor(C.slate200).stroke();
  doc.font(fonts.bold).fontSize(9).fillColor(C.slate900);
  doc.text("TOTALS", colMember, y + 7);
  doc.text(money(totalCollected), M, y + 7, {
    width: rightContributed - M - 6,
    align: "right",
  });
  doc.text(money(totalFines), M, y + 7, {
    width: rightFine - M,
    align: "right",
  });
  y += 32;

  /* ---------------- Fines ---------------- */
  doc.font(fonts.bold).fontSize(11).fillColor(C.slate900).text("FINES", M, y);
  y += 18;

  if (shortfalls.length === 0) {
    doc.roundedRect(M, y, contentW, 34, 8).fillAndStroke(C.slate50, C.slate200);
    doc
      .font(fonts.regular)
      .fontSize(9)
      .fillColor(C.slate600)
      .text("No fines this cycle.", M + 12, y + 12);
    y += 44;
  } else {
    doc.rect(M, y, contentW, 22).fill(C.slate100);
    doc.font(fonts.bold).fontSize(8).fillColor(C.slate600);
    doc.text("MEMBER", colMember, y + 7);
    doc.text("REASON", colStatus, y + 7);
    doc.text("AMOUNT", M, y + 7, { width: rightFine - M, align: "right" });
    y += 22;

    for (const f of shortfalls) {
      if (y > pageH - 80) {
        doc.addPage();
        y = M + 10;
      }
      doc
        .font(fonts.regular)
        .fontSize(9)
        .fillColor(C.slate900)
        .text(f.name, colMember, y + 6, { width: 150, ellipsis: true });
      doc
        .fillColor(C.slate600)
        .text(`Shortfall of ${money(f.shortfall)}`, colStatus, y + 6, {
          width: 240,
        });
      doc
        .fillColor(C.red)
        .text(money(f.fine), M, y + 6, {
          width: rightFine - M,
          align: "right",
        });
      doc
        .moveTo(M, y + 22)
        .lineTo(M + contentW, y + 22)
        .strokeColor(C.slate200)
        .stroke();
      y += 22;
    }
  }

  /* ---------------- Footer on every page ---------------- */
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing inside the bottom margin would make pdfkit auto-add pages.
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const fy = pageH - 34;
    doc
      .moveTo(M, fy)
      .lineTo(pageW - M, fy)
      .strokeColor(C.slate200)
      .stroke();
    doc.font(fonts.regular).fontSize(8).fillColor(C.slate500);
    doc.text("Chama Savings Platform", M, fy + 8);
    doc.text(`Generated ${fmtDate(generatedAt)}`, M, fy + 8, {
      width: contentW,
      align: "center",
    });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, M, fy + 8, {
      width: contentW,
      align: "right",
    });

    doc.page.margins.bottom = savedBottom;
  }

  doc.end();
  await new Promise((resolve) => stream.on("finish", resolve));
  return file;
}

async function closeChamaCycle(chatId) {
  const chama = await repo.findByChatId(chatId);
  if (!chama) throw new Error("Chama not found");
  await closeAndOpenCycle(chama);
}

module.exports = {
  processCycles,
  sendCycleReminders,
  sendCycleSummary,
  generateMonthlyPdf,
  closeChamaCycle,
};
