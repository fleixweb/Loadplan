import type { FleetResult } from "./types";
import { validateFleet } from "./fleet";
import { renderModel } from "./modelExport";
import { buildReport, reportData } from "./exportReport";
import { saveFile } from "../platform/files";
import { volume } from "./sample";

export async function exportFleetReport(
  plan: FleetResult,
  format: "xlsx" | "pdf",
) {
  const audit = validateFleet(plan);
  if (!audit.valid) throw new Error(audit.errors.join("；"));
  const loaded = plan.results.reduce((s, r) => s + r.placements.length, 0);
  const planned = plan.cargo.reduce((s, c) => s + c.quantity, 0);
  const used = plan.results.filter((r) => r.placements.length).length;
  const overviewRows = plan.cargo.map((c) => {
    const count = plan.results.reduce(
      (s, r) => s + r.placements.filter((p) => p.cargoId === c.id).length,
      0,
    );
    return [
      c.name,
      c.model ?? "",
      c.quantity,
      count,
      c.quantity - count,
      plan.results
        .filter((r) => r.placements.some((p) => p.cargoId === c.id))
        .map((r) => r.container.id)
        .join(", "),
    ];
  });
  let blob: Blob;
  if (format === "xlsx") {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Fleix";
    const overview = workbook.addWorksheet("整批汇总");
    overview.addRow(["柜算 · 整批装柜方案"]);
    overview.addRow([
      `使用 ${used} 柜；计划 ${planned} 件；已装 ${loaded} 件；剩余 ${planned - loaded} 件`,
    ]);
    overview.addRow([
      `计算状态：${plan.status === "limit" ? "达到试算上限" : plan.unpacked.length ? "仍有货物未分配" : "全部装入"}；${plan.options.algorithm}；逐柜启发式，不保证最少柜数`,
    ]);
    overview.addRow([
      "产品名称",
      "型号",
      "计划数量",
      "已装数量",
      "未装数量",
      "柜号",
    ]);
    overviewRows.forEach((row) => overview.addRow(row));
    const containers = workbook.addWorksheet("柜子汇总");
    containers.addRow([
      "柜号",
      "名称",
      "装入件数",
      "毛重 / kg",
      "利用率",
      "最大载重 / kg",
    ]);
    for (const r of plan.results) {
      const data = reportData(r);
      containers.addRow([
        r.container.id,
        r.container.name,
        data.loaded,
        data.weight,
        `${(data.utilization * 100).toFixed(1)}%`,
        r.container.maxWeight,
      ]);
      const sheet = workbook.addWorksheet(r.container.id);
      sheet.addRow([r.container.name]);
      sheet.addRow([
        `柜内 ${r.container.size.x} × ${r.container.size.y} × ${r.container.size.z} mm；已装 ${r.placements.length} 件；毛重 ${data.weight} kg`,
      ]);
      const image = renderModel(r);
      const id = workbook.addImage({ base64: image, extension: "png" });
      sheet.addImage(id, {
        tl: { col: 0, row: 3 },
        ext: { width: 800, height: 433 },
      });
      sheet.getRow(28).values = [
        "产品名称",
        "占位尺寸 / mm",
        "单位",
        "单件毛重 / kg",
        "本柜数量",
        "型号",
      ];
      for (let row = 3; row < 28; row++) sheet.getRow(row).height = 20;
      data.rows.forEach((row) =>
        sheet.addRow([
          row.name,
          row.size,
          row.unit,
          row.weight,
          row.loaded,
          r.cargo.find((c) => c.id === row.id)?.model ?? "",
        ]),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const trace = workbook.addWorksheet("逐件装载明细");
    trace.addRow([
      "柜号",
      "货物",
      "型号",
      "序列号 / 箱号",
      "X / mm",
      "Y / mm",
      "Z / mm",
      "层数",
    ]);
    for (const r of plan.results)
      for (const p of r.placements) {
        const c = r.cargo.find((c) => c.id === p.cargoId)!;
        trace.addRow([
          p.containerId,
          c.name,
          c.model ?? "",
          p.serialNumber ?? p.boxId,
          p.position.x,
          p.position.y,
          p.position.z,
          p.layer,
        ]);
      }
    const remainder = workbook.addWorksheet("未装入货物");
    remainder.addRow(["产品名称", "型号", "未装数量", "原因", "未装序列号"]);
    for (const u of plan.unpacked) {
      const c = plan.cargo.find((c) => c.id === u.cargoId)!;
      const assigned = new Set(
        plan.results.flatMap((r) =>
          r.placements
            .filter((p) => p.cargoId === c.id)
            .map((p) => p.serialNumber),
        ),
      );
      remainder.addRow([
        c.name,
        c.model ?? "",
        u.quantity,
        u.reason,
        c.serialNumbers?.filter((s) => !assigned.has(s)).join(", ") ?? "",
      ]);
    }
    for (const ws of workbook.worksheets) {
      ws.columns = Array.from(
        { length: Math.max(ws.columnCount, 6) },
        (_, i) => ({ width: i === 0 ? 30 : 23 }),
      );
      ws.views = [{ state: "normal", showGridLines: false }];
      ws.eachRow((row) => {
        row.height = 32;
        row.eachCell((cell) => {
          cell.font = { name: "Microsoft YaHei", size: 11 };
          cell.alignment = { vertical: "middle", wrapText: true };
        });
      });
      ws.getRow(1).font = { name: "Microsoft YaHei", bold: true, size: 13 };
      ws.pageSetup = {
        orientation: "landscape",
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      };
    }
    blob = new Blob([new Uint8Array(await workbook.xlsx.writeBuffer())], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  } else {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    let firstPage = true;
    const addImage = (image: string) => {
      if (!firstPage) pdf.addPage();
      pdf.addImage(image, "PNG", 0, 0, 210, 297);
      firstPage = false;
    };
    const canvas = document.createElement("canvas");
    canvas.width = 1240;
    canvas.height = 1754;
    const ctx = canvas.getContext("2d")!;
    const lines = [
      "柜算 · 整批装柜方案",
      `使用 ${used} 柜 · 计划 ${planned} 件 · 已装 ${loaded} 件 · 未装 ${planned - loaded} 件`,
      `计算状态：${plan.status === "limit" ? "达到试算上限" : plan.unpacked.length ? "仍有货物未分配" : "全部装入"}`,
      "产品 / 型号 · 计划 / 已装 / 未装 · 柜号",
      ...overviewRows.map(
        (r) => `${r[0]} ${r[1]} · ${r[2]} / ${r[3]} / ${r[4]} · ${r[5]}`,
      ),
    ];
    const wrapped: string[] = [];
    ctx.font = '24px "Microsoft YaHei", sans-serif';
    for (const line of lines) {
      let current = "";
      for (const char of line) {
        if (ctx.measureText(current + char).width > 1100) {
          wrapped.push(current);
          current = "";
        }
        current += char;
      }
      wrapped.push(current);
    }
    for (let start = 0; start < wrapped.length; start += 30) {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 1240, 1754);
      ctx.fillStyle = "#242424";
      wrapped
        .slice(start, start + 30)
        .forEach((line, i) => ctx.fillText(line, 65, 100 + i * 48));
      ctx.fillText("Powered by Fleix · 当前方案不保证最少柜数", 65, 1660);
      addImage(canvas.toDataURL("image/png"));
    }
    for (const r of plan.results) {
      await buildReport(r, renderModel(r), "pdf", (pages) =>
        pages.forEach(addImage),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    blob = pdf.output("blob");
  }
  return saveFile(blob, `柜算-整批装柜方案.${format}`);
}
