/**
 * CSV Exporter & Validation Reporting Utility
 */

const fs = require("fs");
const path = require("path");

function createOutputName(url) {
  const domain = url.hostname
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/gi, "-");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${domain}-${timestamp}`;
}

function escapeCsv(field) {
  const str = String(field ?? "");
  if (/[";\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportCsv(rows, output) {
  const headers = Object.keys(rows[0]);
  const headerRow = headers.map(escapeCsv).join(";");
  const dataRows = rows.map((row) =>
    headers.map((h) => escapeCsv(row[h])).join(";"),
  );
  const csvContent = `\uFEFFsep=;\r\n${headerRow}\r\n${dataRows.join("\r\n")}`;

  const csvPath = path.resolve(`${output}.csv`);
  fs.writeFileSync(csvPath, csvContent, "utf8");
  return csvPath;
}

function saveInvalidReport(output, url, validation, rows) {
  const reportPath = path.resolve(`${output}.invalid.json`);
  const report = {
    url: url.href,
    checkedAt: new Date().toISOString(),
    validation,
    sample: rows.slice(0, 10),
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  return reportPath;
}

module.exports = {
  createOutputName,
  escapeCsv,
  exportCsv,
  saveInvalidReport,
};
