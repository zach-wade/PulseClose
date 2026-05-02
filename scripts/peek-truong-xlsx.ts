// Peek at the Truong intake xlsx the user pointed at to see what shape
// data the doc-ingest endpoint will need to extract. Read-only.
import ExcelJS from "exceljs";

const FILE = "/Users/zachwade/Downloads/K Truong - Track Record - 12-10-25.xlsx";

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  console.log(`Sheets: ${wb.worksheets.map((w) => w.name).join(", ")}`);
  for (const sheet of wb.worksheets) {
    console.log(`\n=== ${sheet.name} (${sheet.rowCount} rows × ${sheet.columnCount} cols) ===`);
    let printed = 0;
    sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (printed >= 30) return;
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value;
        if (v == null) cells.push("");
        else if (typeof v === "object" && "text" in v) cells.push(String((v as { text: unknown }).text ?? ""));
        else if (typeof v === "object" && "result" in v) cells.push(String((v as { result: unknown }).result ?? ""));
        else cells.push(String(v));
      });
      console.log(`  r${rowNum}: ${cells.slice(0, 12).join(" | ")}`);
      printed++;
    });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
