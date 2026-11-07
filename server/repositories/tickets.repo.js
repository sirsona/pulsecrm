// server/repositories/ticket.repo.js

const { getClient, query } = require("../config/db");

async function findOpenByPhone(waPhone) {
  const { rows } = await query(
    `SELECT id,  category, status, notes, created_at 
        FROM leads
        WHERE wa_phone = $1
            AND channel = 'ussd'
            AND status NOT in ('converted', 'lost')
        ORDER BY created_at DESC
        LIMIT 5 `,
    [waPhone],
  );
  return rows;
}

async function create({ phone, category, message }) {
  const { rows } = await query(
    `INSERT INTO leads (wa_phone, name, inquiry_type, category, notes, channel, status)
    VALUES ($1, $2, $3, $4, $5, 'ussd', 'new')
    RETURNING *`,
    [phone, `USSD caller ${phone}`, category, category, message],
  );
  return rows[0];
}

module.exports = { findOpenByPhone, create };
