export type DocumentType = 'pdf' | 'excel' | 'docx' | 'pptx';

export interface DocumentSpec {
  type: DocumentType;
  filename: string;
  title: string;
  content: {
    // Para PDF ou Word
    sections?: Array<{
      title?: string;
      heading?: string;
      text?: string;
      bulletPoints?: string[];
      table?: {
        headers: string[];
        rows: any[][];
      };
    }>;
    // Para Excel
    sheets?: Array<{
      name?: string;
      headers: string[];
      rows: any[][];
    }>;
    // Para PowerPoint
    slides?: Array<{
      title: string;
      subtitle?: string;
      bullets?: string[];
      notes?: string;
    }>;
    // Fallback genérico para texto livre ou tabelas
    text?: string;
    table?: {
      headers: string[];
      rows: any[][];
    };
  };
}

export interface GeneratedDocumentResult {
  blob: Blob;
  url: string;
  sizeBytes: number;
  filename: string;
  title: string;
  type: DocumentType;
}

const EXTENSIONS: Record<DocumentType, string> = {
  pdf: '.pdf',
  excel: '.xlsx',
  docx: '.docx',
  pptx: '.pptx',
};

export function sanitizeFilename(name: string, type: DocumentType): string {
  const ext = EXTENSIONS[type];
  let base = name.trim().replace(/[*?:/\\|"<>;]/g, '_');
  if (base.toLowerCase().endsWith(ext)) {
    base = base.slice(0, -ext.length);
  }
  if (!base) base = `documento_${Date.now()}`;
  return `${base}${ext}`;
}

export function normalizeDocumentSpec(spec: DocumentSpec): DocumentSpec {
  const type = spec.type || 'pdf';
  const filename = sanitizeFilename(spec.filename || `documento`, type);
  const title = spec.title?.trim() || 'Documento Synap';
  const content = spec.content || {};

  return {
    type,
    filename,
    title,
    content,
  };
}

export async function generateDocumentBlob(rawSpec: DocumentSpec): Promise<GeneratedDocumentResult> {
  const spec = normalizeDocumentSpec(rawSpec);

  switch (spec.type) {
    case 'pdf':
      return generatePdf(spec);
    case 'excel':
      return generateExcel(spec);
    case 'docx':
      return generateWord(spec);
    case 'pptx':
      return generatePowerPoint(spec);
    default:
      throw new Error(`Tipo de documento não suportado: ${spec.type}`);
  }
}

// 1. Compilador PDF (Dynamic import jspdf + autotable)
async function generatePdf(spec: DocumentSpec): Promise<GeneratedDocumentResult> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let currentY = 20;

  // Cabeçalho Principal
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text(spec.title, 14, currentY);
  currentY += 10;

  // Linha separadora elegante
  doc.setDrawColor(217, 119, 87); // tom âmbar do Synap
  doc.setLineWidth(0.8);
  doc.line(14, currentY, pageWidth - 14, currentY);
  currentY += 8;

  const sections = spec.content.sections || [];

  // Seção com texto direto no content
  if (spec.content.text) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    const splitText = doc.splitTextToSize(spec.content.text, pageWidth - 28);
    doc.text(splitText, 14, currentY);
    currentY += splitText.length * 6 + 6;
  }

  // Tabela direta no content
  if (spec.content.table && spec.content.table.headers.length > 0) {
    autoTable(doc, {
      startY: currentY,
      head: [spec.content.table.headers],
      body: spec.content.table.rows || [],
      margin: { left: 14, right: 14 },
      headStyles: { fillColor: [40, 36, 32], textColor: [240, 240, 240] },
      alternateRowStyles: { fillColor: [248, 247, 245] },
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  // Seções estruturadas
  for (const section of sections) {
    if (currentY > 260) {
      doc.addPage();
      currentY = 20;
    }

    const secTitle = section.title || section.heading;
    if (secTitle) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(45, 45, 45);
      doc.text(secTitle, 14, currentY);
      currentY += 7;
    }

    if (section.text) {
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      const splitText = doc.splitTextToSize(section.text, pageWidth - 28);
      doc.text(splitText, 14, currentY);
      currentY += splitText.length * 5.5 + 5;
    }

    if (section.bulletPoints && section.bulletPoints.length > 0) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      for (const bullet of section.bulletPoints) {
        doc.text(`• ${bullet}`, 18, currentY);
        currentY += 5.5;
      }
      currentY += 3;
    }

    if (section.table && section.table.headers && section.table.headers.length > 0) {
      autoTable(doc, {
        startY: currentY,
        head: [section.table.headers],
        body: section.table.rows || [],
        margin: { left: 14, right: 14 },
        headStyles: { fillColor: [40, 36, 32], textColor: [240, 240, 240] },
        alternateRowStyles: { fillColor: [248, 247, 245] },
      });
      currentY = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  const blob = doc.output('blob');
  const url = typeof window !== 'undefined' ? URL.createObjectURL(blob) : '';
  return {
    blob,
    url,
    sizeBytes: blob.size,
    filename: spec.filename,
    title: spec.title,
    type: 'pdf',
  };
}

// 2. Compilador Excel (Dynamic import ExcelJS)
async function generateExcel(spec: DocumentSpec): Promise<GeneratedDocumentResult> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Synap Document Engine';
  workbook.created = new Date();

  const sheets = spec.content.sheets || [];

  if (sheets.length === 0) {
    const ws = workbook.addWorksheet(spec.title.slice(0, 30) || 'Dados');
    const headers = spec.content.table?.headers || ['Informação', 'Valor'];
    const rows = spec.content.table?.rows || [];

    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E1E1E' },
    };

    rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((column) => {
      column.width = 20;
    });
  } else {
    for (const sheetSpec of sheets) {
      const sheetName = (sheetSpec.name || 'Planilha').slice(0, 30);
      const ws = workbook.addWorksheet(sheetName);

      const headerRow = ws.addRow(sheetSpec.headers || []);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2D3748' },
      };

      (sheetSpec.rows || []).forEach((row) => ws.addRow(row));
      ws.columns.forEach((col) => {
        col.width = 18;
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = typeof window !== 'undefined' ? URL.createObjectURL(blob) : '';

  return {
    blob,
    url,
    sizeBytes: blob.size,
    filename: spec.filename,
    title: spec.title,
    type: 'excel',
  };
}

// 3. Compilador Word (Dynamic import docx)
async function generateWord(spec: DocumentSpec): Promise<GeneratedDocumentResult> {
  const { Document, Paragraph, TextRun, HeadingLevel, Packer } = await import('docx');
  const children: any[] = [];

  // Título do Documento
  children.push(
    new Paragraph({
      text: spec.title,
      heading: HeadingLevel.TITLE,
      spacing: { after: 250 },
    })
  );

  if (spec.content.text) {
    children.push(
      new Paragraph({
        children: [new TextRun(spec.content.text)],
        spacing: { after: 200 },
      })
    );
  }

  const sections = spec.content.sections || [];
  for (const sec of sections) {
    const secHeading = sec.title || sec.heading;
    if (secHeading) {
      children.push(
        new Paragraph({
          text: secHeading,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        })
      );
    }

    if (sec.text) {
      children.push(
        new Paragraph({
          children: [new TextRun(sec.text)],
          spacing: { after: 140 },
        })
      );
    }

    if (sec.bulletPoints) {
      for (const bp of sec.bulletPoints) {
        children.push(
          new Paragraph({
            text: bp,
            bullet: { level: 0 },
            spacing: { after: 80 },
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = typeof window !== 'undefined' ? URL.createObjectURL(blob) : '';

  return {
    blob,
    url,
    sizeBytes: blob.size,
    filename: spec.filename,
    title: spec.title,
    type: 'docx',
  };
}

// 4. Compilador PowerPoint (Dynamic import pptxgenjs)
async function generatePowerPoint(spec: DocumentSpec): Promise<GeneratedDocumentResult> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';

  // Slide de Abertura / Título
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: '181715' }; // Dark theme do Synap
  titleSlide.addText(spec.title, {
    x: 1.0,
    y: 2.2,
    w: '80%',
    h: 1.5,
    fontSize: 36,
    bold: true,
    color: 'F3EFE6',
    align: 'center',
  });

  const slides = spec.content.slides || [];
  for (const s of slides) {
    const slide = pptx.addSlide();
    slide.background = { color: 'F8F7F5' };

    // Título do Slide
    slide.addText(s.title, {
      x: 0.8,
      y: 0.6,
      w: '85%',
      h: 0.8,
      fontSize: 24,
      bold: true,
      color: '201E1B',
    });

    if (s.subtitle) {
      slide.addText(s.subtitle, {
        x: 0.8,
        y: 1.3,
        w: '85%',
        h: 0.5,
        fontSize: 14,
        color: '6E685F',
      });
    }

    if (s.bullets && s.bullets.length > 0) {
      const bulletTexts = s.bullets.map((b) => ({ text: b, options: { bullet: true, fontSize: 16, color: '302D28' } }));
      slide.addText(bulletTexts, {
        x: 0.8,
        y: 2.0,
        w: '85%',
        h: 4.2,
        lineSpacing: 28,
      });
    }
  }

  const blob = (await pptx.write({ outputType: 'blob' })) as Blob;
  const url = typeof window !== 'undefined' ? URL.createObjectURL(blob) : '';

  return {
    blob,
    url,
    sizeBytes: blob.size,
    filename: spec.filename,
    title: spec.title,
    type: 'pptx',
  };
}
