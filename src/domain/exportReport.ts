/* Copyright (C) 2026 Fleix. SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPL sections 7(b), 7(c): see ADDITIONAL_TERMS.md. */
import type { PackingResult } from "./types";
import { volume } from "./sample";
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandIcon } from '../components/Brand';
import { saveFile } from '../platform/files';

export function reportData(result: PackingResult) {
  const rows = result.cargo.map((c) => {
    const loaded = result.placements.filter((p) => p.cargoId === c.id).length;
    return {
      name: c.name,
      color: c.color,
      size: `${c.size.x} × ${c.size.y} × ${c.size.z}`,
      unit: c.loadUnit === "pallet" ? "托" : "箱",
      weight: c.weight,
      planned: c.quantity,
      loaded,
      remaining: c.quantity - loaded,
      reason:
        loaded === c.quantity
          ? "全部装入"
          : result.unpacked.find((u) => u.cargoId === c.id)?.reason ||
            "当前方案未装入",
    };
  });
  const loaded = result.placements.length;
  const planned = rows.reduce((s, r) => s + r.planned, 0);
  const weight = result.placements.reduce((s, p) => s + p.weight, 0);
  const utilization =
    result.placements.reduce((s, p) => s + volume(p.size), 0) /
    volume(result.container.size);
  return { rows, loaded, planned, weight, utilization };
}

const note =
  "本报告为装柜估算；圆柱及不规则货物按占位尺寸计容。未装入不代表无法装入，实际装载需核实支撑和运输条件。";
const credit = "Powered by Fleix 45186482@qq.com";

async function brandFooter() {
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1240; canvas.height = 140;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,1240,140);
  ctx.fillStyle = '#dddddf'; ctx.fillRect(0,0,1240,2);
  const icon = new Image();
  icon.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(renderToStaticMarkup(createElement(BrandIcon, {size:32,strokeWidth:1.7,color:'#ffffff'})));
  await icon.decode();
  ctx.fillStyle='#292929';ctx.beginPath();ctx.roundRect(280,20,56,56,14);ctx.fill();
  ctx.drawImage(icon,292,32,32,32);
  ctx.font='bold 30px "Microsoft YaHei", "PingFang SC", sans-serif';ctx.fillStyle='#242424';ctx.fillText('柜算',350,59);
  ctx.font='bold 16px sans-serif';ctx.fillStyle='#626262';ctx.fillText('L O A D P L A N',430,58);
  ctx.fillStyle='#dddddf';ctx.fillRect(590,32,1,32);
  ctx.font='21px "Microsoft YaHei", "PingFang SC", sans-serif';ctx.fillStyle='#626262';ctx.fillText('免费开源的装柜计算工具',614,57);
  ctx.font='19px sans-serif';ctx.textAlign='center';ctx.fillText(credit,620,113);
  return canvas;
}
const headers = [
  "产品名称",
  "占位尺寸 / mm",
  "单位",
  "单件毛重 / kg",
  "计划数量",
  "已装数量",
  "未装数量",
  "结果说明",
];

export async function exportReport(
  result: PackingResult,
  image: string,
  format: "xlsx" | "pdf",
) {
  const data = reportData(result);
  const date = new Date().toLocaleString("zh-CN", { hour12: false });
  const c = result.container;
  const summary = `计划 ${data.planned} 件 · 已装 ${data.loaded} 件 · 未装 ${data.planned - data.loaded} 件 · 已装毛重 ${data.weight.toFixed(1)} kg · 空间利用率 ${(data.utilization * 100).toFixed(1)}%`;
  const containerLine = `${c.name}（${c.id}） · 柜内 ${c.size.x} × ${c.size.y} × ${c.size.z} mm · 最大载重 ${c.maxWeight} kg`;
  const constraints = `柜门 ${c.door.width} × ${c.door.height} mm；预留间隙：柜壁 ${c.clearance?.walls ?? 0} / 柜门前 ${c.clearance?.door ?? 0} / 货物间 ${c.clearance?.between ?? 0} mm`;
  const img = new Image();
  img.src = image;
  await img.decode();
  const footerBrand = await brandFooter();
  let blob: Blob;
  if (format === "xlsx") {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Fleix";
    const overview = workbook.addWorksheet("装柜方案");
    overview.properties.defaultRowHeight = 15;
    overview.columns = [26, 26, 8, 14, 11, 11, 11, 38].map((width) => ({
      width,
    }));
    [
      "柜算 · 装柜方案",
      `生成时间：${date}`,
      containerLine,
      summary,
      constraints,
      "3D 装载图（当前视角，显示全部层）",
    ].forEach((value, i) => {
      overview.mergeCells(i + 1, 1, i + 1, 8);
      overview.getCell(i + 1, 1).value = value;
      overview.getRow(i + 1).height = i === 0 ? 32 : 28;
      overview.getCell(i + 1, 1).alignment = {
        vertical: "middle",
        wrapText: true,
        indent: 1,
      };
      overview.getCell(i + 1, 1).font = {
        name: "Microsoft YaHei",
        size: i === 0 ? 22 : 11,
        bold: i === 0 || i === 3 || i === 5,
        color: { argb: i === 0 ? "FFFFFFFF" : "FF242424" },
      };
      overview.getCell(i + 1, 1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {
          argb:
            i === 0 ? "FF292929" : i === 3 || i === 5 ? "FFF1F2F4" : "FFFFFFFF",
        },
      };
    });
    overview.getRow(1).height = 42;
    const imageHeight = Math.min(360, (1000 * img.height) / img.width);
    const imageWidth = (imageHeight * img.width) / img.height;
    const sheetWidth = overview.columns.reduce(
      (sum, col) => sum + Math.floor((col.width ?? 8) * 7 + 5),
      0,
    );
    const imageCanvas = document.createElement('canvas');
    imageCanvas.width = sheetWidth;
    imageCanvas.height = Math.ceil(imageHeight);
    const imageContext = imageCanvas.getContext('2d')!;
    imageContext.fillStyle = '#ffffff';
    imageContext.fillRect(0, 0, sheetWidth, imageHeight);
    imageContext.drawImage(img, (sheetWidth-imageWidth)/2, 0, imageWidth, imageHeight);
    const imageId = workbook.addImage({base64:imageCanvas.toDataURL('image/png'),extension:'png'});
    overview.addImage(imageId, {
      tl: { col: 0, row: 6.5 },
      ext: { width: sheetWidth, height: imageHeight },
    });
    const sectionRow = 9 + Math.ceil(imageHeight / 20);
    overview.mergeCells(sectionRow, 1, sectionRow, 8);
    overview.getCell(sectionRow, 1).value = "货物装载明细";
    overview.getCell(sectionRow, 1).font = { size: 14, bold: true };
    overview.getCell(sectionRow, 1).alignment = {
      vertical: "middle",
      indent: 1,
    };
    overview.getCell(sectionRow, 1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F2F4" },
    };
    overview.getRow(sectionRow).height = 28;
    const headerRow = sectionRow + 1;
    overview.getRow(headerRow).values = headers;
    data.rows.forEach((row, index) => {
      overview.getRow(headerRow + index + 1).values = [
        row.name,
        row.size,
        row.unit,
        row.weight,
        row.planned,
        row.loaded,
        row.remaining,
        row.reason,
      ];
    });
    const lastDetailRow = headerRow + data.rows.length;
    for (let n = headerRow; n <= lastDetailRow; n++) {
      const row = overview.getRow(n);
      const displayLines = (value: unknown, width: number) =>
        Math.ceil(
          Array.from(String(value)).reduce(
            (sum, char) => sum + (char.charCodeAt(0) > 255 ? 2 : 1),
            0,
          ) /
            (width - 3),
        );
      row.height =
        n === headerRow
          ? 32
          : Math.max(
              34,
              ...[1, 2, 8].map(
                (col) =>
                  displayLines(
                    row.getCell(col).value,
                    overview.getColumn(col).width!,
                  ) *
                    15 +
                  12,
              ),
            );
      row.eachCell((cell, col) => {
        cell.alignment = {
          vertical: "middle",
          wrapText: true,
          horizontal: col === 1 || col === 8 ? "left" : "center",
          indent: col === 1 || col === 8 ? 1 : 0,
        };
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFDDDDDF" } },
        };
        if (n !== headerRow)
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: (n - headerRow) % 2 ? "FFFFFFFF" : "FFF7F7F8" },
          };
        if (n !== headerRow && col === 4) cell.numFmt = "0.##";
        cell.font = {
          name: "Microsoft YaHei",
          size: 11,
          color: { argb: n === headerRow ? "FFFFFFFF" : "FF242424" },
        };
        if (n === headerRow)
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF292929" },
          };
      });
    }
    const totalRow = lastDetailRow + 1;
    overview.getRow(totalRow).values = [
      "合计",
      "",
      "件",
      "",
      data.planned,
      data.loaded,
      data.planned - data.loaded,
      "不同装载单位按件数合计",
    ];
    overview.getRow(totalRow).height = 30;
    overview.getRow(totalRow).eachCell((cell) => {
      cell.font = { name: "Microsoft YaHei", size: 11, bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF1F2F4" },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };
    });
    const footerRow = totalRow + 2;
    overview.mergeCells(footerRow, 1, footerRow, 8);
    overview.getCell(footerRow, 1).value = note;
    overview.getCell(footerRow, 1).alignment = {
      wrapText: true,
      vertical: "middle",
    };
    overview.getRow(footerRow).height = 32;
    const footerImage = workbook.addImage({base64:footerBrand.toDataURL('image/png'),extension:'png'});
    const footerHeight = sheetWidth * footerBrand.height / footerBrand.width;
    overview.addImage(footerImage,{tl:{col:0,row:footerRow+1},ext:{width:sheetWidth,height:footerHeight}});
    const lastPrintRow = footerRow + 2 + Math.ceil(footerHeight/20);
    overview.views = [{ state: "normal", showGridLines: false }];
    overview.autoFilter = { from: `A${headerRow}`, to: `H${lastDetailRow}` };
    overview.pageSetup = {
      orientation: "portrait",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printArea: `A1:H${lastPrintRow}`,
      horizontalCentered: true,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.35,
        bottom: 0.35,
        header: 0.15,
        footer: 0.15,
      },
    };
    overview.headerFooter.oddFooter = "第 &P 页 / 共 &N 页";
    const bytes = await workbook.xlsx.writeBuffer();
    blob = new Blob([new Uint8Array(bytes)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  } else {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    // Canvas uses locally available Chinese fonts, so reports also work offline.
    const canvas = document.createElement("canvas");
    canvas.width = 1240;
    canvas.height = 1754;
    const ctx = canvas.getContext("2d")!;
    const pages: string[] = [];
    let y = 0;
    function text(
      value: string,
      x: number,
      top: number,
      width: number,
      size = 22,
    ) {
      ctx.font = `${size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
      ctx.fillStyle = "#242424";
      let line = "";
      let py = top;
      for (const char of value) {
        if (ctx.measureText(line + char).width > width && line) {
          ctx.fillText(line, x, py);
          py += size * 1.5;
          line = "";
        }
        line += char;
      }
      ctx.fillText(line, x, py);
      return py + size * 1.5;
    }
    function start(title: string) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 1240, 1754);
      text(title, 65, 90, 1110, 34);
      text(`生成时间：${date}`, 65, 132, 1110, 18);
      ctx.fillStyle = "#292929";
      ctx.fillRect(65, 151, 1110, 3);
      y = 180;
    }
    function finish() {
      ctx.drawImage(footerBrand,65,1575,1110,125);
      text(`第 ${pages.length + 1} 页`, 1090,1730,100,16);
      pages.push(canvas.toDataURL("image/png"));
    }
    start("柜算 · 装柜方案");
    y = text(containerLine, 65, y, 1110) + 15;
    const metrics = [
      ["计划件数", String(data.planned)],
      ["已装件数", String(data.loaded)],
      ["未装件数", String(data.planned - data.loaded)],
      ["已装毛重 / kg", data.weight.toFixed(1)],
      ["空间利用率", `${(data.utilization * 100).toFixed(1)}%`],
    ];
    ctx.fillStyle = "#f1f2f4";
    ctx.fillRect(65, y, 1110, 100);
    metrics.forEach(([label, value], i) => {
      text(label, 85 + i * 222, y + 30, 200, 18);
      text(value, 85 + i * 222, y + 75, 200, 32);
    });
    y += 135;
    y = text(constraints, 65, y, 1110, 18) + 22;
    y = text("3D 装载图（当前视角，显示全部层）", 65, y, 1110, 26) + 15;
    const h = Math.min(450, (1110 * img.height) / img.width);
    const w = (h * img.width) / img.height;
    ctx.drawImage(img, 65 + (1110 - w) / 2, y, w, h);
    y += h + 40;
    const widths = [220, 200, 60, 110, 80, 80, 80, 280];
    const wrap = (value: string, width: number) => {
      ctx.font = '18px "Microsoft YaHei", "PingFang SC", sans-serif';
      const lines: string[] = [];
      let line = "";
      for (const char of value) {
        if (ctx.measureText(line + char).width > width && line) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
      lines.push(line);
      return lines;
    };
    function tableRow(values: string[], header = false, stripe = false) {
      const lines = values.map((value, i) => wrap(value, widths[i] - 20));
      const height = Math.max(
        48,
        ...lines.map((line) => line.length * 26 + 20),
      );
      ctx.fillStyle = header ? "#292929" : stripe ? "#f5f5f6" : "#ffffff";
      ctx.fillRect(65, y, 1110, height);
      let x = 65;
      lines.forEach((items, i) => {
        ctx.fillStyle = header ? "#ffffff" : "#242424";
        ctx.font = '18px "Microsoft YaHei", "PingFang SC", sans-serif';
        items.forEach((line, j) => {
          const tx =
            i >= 2 && i <= 6
              ? x + (widths[i] - ctx.measureText(line).width) / 2
              : x + 10;
          ctx.fillText(line, tx, y + 26 + j * 26);
        });
        x += widths[i];
      });
      y += height;
      ctx.strokeStyle = "#dddddf";
      ctx.beginPath();
      ctx.moveTo(65, y);
      ctx.lineTo(1175, y);
      ctx.stroke();
    }
    const tableHeaders = [
      "产品名称",
      "占位尺寸 / mm",
      "单位",
      "毛重 / kg",
      "计划",
      "已装",
      "未装",
      "结果说明",
    ];
    function tableHeading() {
      y = text("货物装载明细", 65, y, 1110, 26) + 10;
      tableRow(tableHeaders, true);
    }
    tableHeading();
    data.rows.forEach((row, i) => {
      const values = [
        row.name,
        row.size,
        row.unit,
        String(row.weight),
        String(row.planned),
        String(row.loaded),
        String(row.remaining),
        row.reason,
      ];
      const height = Math.max(
        48,
        ...values.map((v, j) => wrap(v, widths[j] - 20).length * 26 + 20),
      );
      if (y + height > 1440) {
        finish();
        start("柜算 · 装柜方案（续）");
        tableHeading();
      }
      tableRow(values, false, i % 2 === 1);
    });
    if (y + 160 > 1550) {
      finish();
      start("柜算 · 装柜方案（续）");
    }
    tableRow(
      [
        "合计",
        "",
        "件",
        "",
        String(data.planned),
        String(data.loaded),
        String(data.planned - data.loaded),
        "不同装载单位按件数合计",
      ],
      false,
      true,
    );
    y += 30;
    text(note, 65, y, 1110, 18);
    finish();
    pages.forEach((page, i) => {
      if (i) pdf.addPage();
      pdf.addImage(page, "PNG", 0, 0, 210, 297);
    });
    blob = pdf.output("blob");
  }
  return saveFile(blob, `柜算-装柜方案-${c.id.replace(/[^a-zA-Z0-9_-]/g, "_")}-${new Date().toISOString().slice(0, 10)}.${format}`);
}
