// // client/src/components/LeadsTable.js
// const STATUS_STYLES = {
//   new: "bg-blue-100 text-blue-800",
//   contacted: "bg-yellow-100 text-yellow-800",
//   qualified: "bg-purple-100 text-purple-800",
//   converted: "bg-green-100 text-green-800",
//   lost: "bg-gray-200 text-gray-700",
// };

// export default function LeadsTable({ leads, onSelect }) {
//   if (leads.length === 0) {
//     return (
//       <div className="text-center text-gray-500 py-12 bg-white rounded-lg shadow">
//         No leads yet. Message your WhatsApp number to create one.
//       </div>
//     );
//   }

//   // Helper function to safely format dates
//   function formatDate(dateString) {
//     if (!dateString) return "-";

//     try {
//       // Try parsing as ISO string
//       const date = new Date(dateString);

//       // Check if date is valid
//       if (isNaN(date.getTime())) {
//         return "-";
//       }

//       return date.toLocaleString();
//     } catch (error) {
//       return "-";
//     }
//   }

//   return (
//     <div className="bg-white rounded-lg shadow overflow-hidden">
//       <table className="w-full text-sm">
//         <thead className="bg-gray-50 text-gray-600 text-left">
//           <tr>
//             <th className="px-4 py-3">Name</th>
//             <th className="px-4 py-3">Phone</th>
//             <th className="px-4 py-3">Inquiry</th>
//             <th className="px-4 py-3">Status</th>
//             <th className="px-4 py-3">Received</th>
//           </tr>
//         </thead>
//         <tbody>
//           {leads.map((lead) => (
//             <tr
//               key={lead.id}
//               className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
//               onClick={() => onSelect(lead)}
//             >
//               <td className="px-4 py-3 font-medium text-gray-900">
//                 {lead.name || "(no name yet)"}
//               </td>
//               <td className="px-4 py-3 text-gray-700">+{lead.wa_phone}</td>
//               <td className="px-4 py-3 text-gray-700">
//                 {lead.inquiry_type || "-"}
//               </td>
//               <td className="px-4 py-3">
//                 <span
//                   className={
//                     "px-2 py-1 rounded-full text-xs font-medium " +
//                     (STATUS_STYLES[lead.status] || "bg-gray-100 text-gray-700")
//                   }
//                 >
//                   {lead.status}
//                 </span>
//               </td>
//               <td className="px-4 py-3 text-gray-500">
//                 {/* {new Date(
//                   lead.created_at.replace(" ", "T") + "Z",
//                 ).toLocaleString()} */}
//                 {formatDate(lead.created_at)}
//               </td>
//             </tr>
//           ))}
//         </tbody>
//       </table>
//     </div>
//   );
// }

// client/src/components/LeadsTable.js
const STATUS_STYLES = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-yellow-100 text-yellow-800",
  qualified: "bg-purple-100 text-purple-800",
  converted: "bg-green-100 text-green-800",
  lost: "bg-gray-200 text-gray-700",
};

// Helper: safely format date from any string
function formatDate(dateString) {
  if (!dateString) return "-";

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      // Try replacing " " with "T" if the format is like "2026-06-18 16:21:59"
      const cleaned = dateString.replace(" ", "T");
      const retryDate = new Date(cleaned);
      if (!isNaN(retryDate.getTime())) {
        return retryDate.toLocaleString();
      }
      return "-";
    }
    return date.toLocaleString();
  } catch {
    return "-";
  }
}

export default function LeadsTable({ leads, onSelect, currentUser }) {
  if (leads.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12 bg-white rounded-lg shadow">
        No leads found. Try adjusting your filters or message your WhatsApp
        number to create one.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 text-left">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3">Inquiry</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Assigned to</th>
            <th className="px-4 py-3">Received</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr
              key={lead.id}
              className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
              onClick={() => onSelect(lead)}
            >
              <td className="px-4 py-3 font-medium text-gray-900">
                {lead.name || "(no name yet)"}
              </td>
              <td className="px-4 py-3 text-gray-700">{lead.wa_phone}</td>
              <td className="px-4 py-3 text-gray-700">
                {lead.inquiry_type || "-"}
              </td>
              <td className="px-4 py-3">
                <span
                  className={
                    "px-2 py-1 rounded-full text-xs font-medium " +
                    (STATUS_STYLES[lead.status] || "bg-gray-100 text-gray-700")
                  }
                >
                  {lead.status}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500">
                {lead.assigned_to_name ? (
                  <span className="text-gray-700">{lead.assigned_to_name}</span>
                ) : (
                  <span className="text-gray-400 italic">Unassigned</span>
                )}
              </td>
              <td className="px-4 py-3 text-gray-500">
                {formatDate(lead.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
