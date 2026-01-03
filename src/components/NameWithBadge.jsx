import React from "react";

export default function NameWithBadge({ userId, name, badges, dueInvoices }) {
  const badge = badges.find((b) => b.user_id === userId);
  const due = dueInvoices.find((d) => d.user_id === userId);

  if (!badge || !badge.has_unpaid) {
    return <span>{name}</span>;
  }

  // ✅ Tooltip with overdue days
  const tooltip = due
    ? `Unpaid: USD ${due.balance_due} (Due ${new Date(
        due.due_date
      ).toLocaleDateString()})${
        due.overdue_days > 0 ? ` • Overdue by ${due.overdue_days} days` : ""
      }`
    : "Unpaid invoice";

  return (
    <span>
      {name}{" "}
      <span
        title={tooltip}
        style={{
          color: badge.show_red ? "red" : "gray",
          fontWeight: "bold",
          marginLeft: "4px",
          cursor: "pointer",
        }}
      >
        $
      </span>
    </span>
  );
}
