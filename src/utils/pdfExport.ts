import { jsPDF } from 'jspdf';
import {
  CardBounds,
  OptometricCalculations,
  Point2D,
} from '../types/optometry';

export interface AnnotatedImageOptions {
  imageUrl: string;
  calculations: OptometricCalculations;
  points: {
    rightPupil: Point2D;
    leftPupil: Point2D;
    noseBridge: Point2D;
    cardBounds: CardBounds;
  };
}

export interface PdfExportOptions extends AnnotatedImageOptions {
  patientName?: string;
}

/**
 * Loads an image URL (data URL or remote/blob URL) into an HTMLImageElement.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Draws a rounded pill label with background and centered text on a 2D canvas.
 */
function drawBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  bgColor: string,
  borderColor: string,
  textColor: string,
  fontSize: number
) {
  ctx.save();
  ctx.font = `bold ${fontSize}px "JetBrains Mono", monospace`;
  const metrics = ctx.measureText(text);
  const padX = fontSize * 0.65;
  const padY = fontSize * 0.35;
  const w = metrics.width + padX * 2;
  const h = fontSize + padY * 2;
  const x = centerX - w / 2;
  const y = centerY - h / 2;
  const r = Math.min(6, h / 2);

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.lineWidth = Math.max(1, fontSize * 0.08);
  ctx.strokeStyle = borderColor;
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, centerX, centerY + 0.5);
  ctx.restore();
}

/**
 * Renders the photo with full optometric annotations onto an HTML5 Canvas
 * and returns a high-resolution JPEG data URL along with dimensions.
 */
export async function renderAnnotatedImage({
  imageUrl,
  calculations,
  points,
}: AnnotatedImageOptions): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(imageUrl);

  // Normalize resolution for crisp output without excessive PDF file size
  const maxDim = 1600;
  const natW = img.naturalWidth || 1280;
  const natH = img.naturalHeight || 720;
  const scaleDown = Math.min(1, maxDim / Math.max(natW, natH));
  const width = Math.round(natW * scaleDown);
  const height = Math.round(natH * scaleDown);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Impossible de créer le contexte graphique Canvas.');
  }

  // Draw base image
  ctx.drawImage(img, 0, 0, width, height);

  // Proportional sizing based on image width
  const u = Math.max(1, width / 1000);
  const fontSize = Math.round(15 * u);
  const smallFontSize = Math.round(13 * u);

  const { rightPupil, leftPupil, noseBridge, cardBounds } = points;

  const cardLeft = Math.min(cardBounds.left, cardBounds.right) * width;
  const cardRight = Math.max(cardBounds.left, cardBounds.right) * width;
  const cardTop = Math.min(cardBounds.top, cardBounds.bottom) * height;
  const cardBottom = Math.max(cardBounds.top, cardBounds.bottom) * height;
  const cardW = cardRight - cardLeft;
  const cardH = cardBottom - cardTop;

  const rPx = { x: rightPupil.x * width, y: rightPupil.y * height };
  const lPx = { x: leftPupil.x * width, y: leftPupil.y * height };
  const nPx = { x: noseBridge.x * width, y: noseBridge.y * height };

  // 1. Reference Credit Card Box (ID-1)
  ctx.save();
  ctx.fillStyle = 'rgba(244, 63, 94, 0.10)';
  ctx.fillRect(cardLeft, cardTop, cardW, cardH);

  ctx.strokeStyle = '#FF1744';
  ctx.lineWidth = 2.5 * u;
  ctx.setLineDash([8 * u, 5 * u]);
  ctx.strokeRect(cardLeft, cardTop, cardW, cardH);
  ctx.restore();

  drawBadge(
    ctx,
    `Carte ID-1: ${calculations.cardWidthMm.toFixed(2)} mm (${Math.round(calculations.cardWidthPixels)} px)`,
    cardLeft + cardW / 2,
    Math.max(fontSize * 1.3, cardTop - 16 * u),
    'rgba(2, 6, 23, 0.88)',
    '#FF1744',
    '#FDA4AF',
    smallFontSize
  );

  // 2. Nose Bridge Vertical Symmetry Axis
  ctx.save();
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 2 * u;
  ctx.setLineDash([6 * u, 5 * u]);
  ctx.beginPath();
  ctx.moveTo(nPx.x, Math.max(0, nPx.y - height * 0.09));
  ctx.lineTo(nPx.x, Math.min(height, nPx.y + height * 0.09));
  ctx.stroke();
  ctx.restore();

  // 3. Monocular Half-PD Lines (from pupils to nasal axis)
  ctx.save();
  ctx.lineWidth = 2 * u;
  ctx.strokeStyle = 'rgba(255, 23, 68, 0.85)';
  ctx.beginPath();
  ctx.moveTo(rPx.x, rPx.y);
  ctx.lineTo(nPx.x, rPx.y);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0, 229, 255, 0.85)';
  ctx.beginPath();
  ctx.moveTo(lPx.x, lPx.y);
  ctx.lineTo(nPx.x, lPx.y);
  ctx.stroke();
  ctx.restore();

  // 4. Interocular PD Line (Pupil to Pupil)
  ctx.save();
  ctx.strokeStyle = '#00E5FF';
  ctx.lineWidth = 3 * u;
  ctx.setLineDash([10 * u, 5 * u]);
  ctx.beginPath();
  ctx.moveTo(rPx.x, rPx.y);
  ctx.lineTo(lPx.x, lPx.y);
  ctx.stroke();
  ctx.restore();

  // Total PD Badge above interocular midpoint
  const midX = (rPx.x + lPx.x) / 2;
  const midY = (rPx.y + lPx.y) / 2;
  drawBadge(
    ctx,
    `VL: ${calculations.totalPdDistance} mm`,
    midX,
    Math.max(fontSize * 1.4, midY - 28 * u),
    'rgba(2, 6, 23, 0.90)',
    '#00E5FF',
    '#67E8F9',
    fontSize
  );

  // 5. Target Reticles on Pupils and Nose Bridge
  const drawReticle = (x: number, y: number, color: string, radius: number) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2 * u;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshairs
    const cross = radius * 1.5;
    ctx.beginPath();
    ctx.moveTo(x - cross, y);
    ctx.lineTo(x + cross, y);
    ctx.moveTo(x, y - cross);
    ctx.lineTo(x, y + cross);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x, y, 3 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  drawReticle(rPx.x, rPx.y, '#FF1744', 14 * u);
  drawBadge(
    ctx,
    `OD: ${calculations.rightMonocularPd} mm`,
    rPx.x,
    Math.min(height - smallFontSize * 1.3, rPx.y + 30 * u),
    'rgba(2, 6, 23, 0.90)',
    '#FF1744',
    '#FDA4AF',
    smallFontSize
  );

  drawReticle(lPx.x, lPx.y, '#00E5FF', 14 * u);
  drawBadge(
    ctx,
    `OG: ${calculations.leftMonocularPd} mm`,
    lPx.x,
    Math.min(height - smallFontSize * 1.3, lPx.y + 30 * u),
    'rgba(2, 6, 23, 0.90)',
    '#00E5FF',
    '#67E8F9',
    smallFontSize
  );

  // Nose dot
  ctx.save();
  ctx.fillStyle = '#F59E0B';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1.5 * u;
  ctx.beginPath();
  ctx.arc(nPx.x, nPx.y, 5 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    width,
    height,
  };
}

/**
 * Generates and downloads a complete A4 PDF report containing the annotated photo
 * and all detailed optometric measurements (Far/Near/Intermediate PD, OD/OG half-PDs).
 */
export async function exportResultsToPdf({
  imageUrl,
  calculations,
  points,
  patientName,
}: PdfExportOptions): Promise<void> {
  const annotated = await renderAnnotatedImage({ imageUrl, calculations, points });

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // --- HEADER BANNER ---
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 30, 'F');

  // Rose accent strip
  doc.setFillColor(225, 29, 72); // rose-600
  doc.rect(0, 30, pageWidth, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('OptiPD', margin, 13);

  doc.setTextColor(251, 113, 133); // rose-400
  doc.setFontSize(9);
  doc.text('RAPPORT DE CENTRAGE PUPILLAIRE & OPTOMÉTRIE', margin + 25, 12.5);

  doc.setTextColor(148, 163, 184); // slate-400
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Étalonnage ISO/IEC 7810 ID-1 (85.60 x 53.98 mm) avec compensation de convergence', margin, 21);

  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR');
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const refCode = Date.now().toString(36).toUpperCase();

  doc.setTextColor(226, 232, 240);
  doc.setFontSize(8.5);
  doc.text(`Date : ${dateStr} à ${timeStr}`, pageWidth - margin, 13, { align: 'right' });
  doc.setTextColor(148, 163, 184);
  doc.text(`Réf : ${refCode}`, pageWidth - margin, 21, { align: 'right' });

  let y = 39;

  // --- PATIENT / REFERENCE INFO ---
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 11, 2, 2, 'FD');

  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  const displayPatient = patientName?.trim() ? patientName.trim() : 'Non renseigné';
  doc.text(`Patient / Référence : ${displayPatient}`, margin + 4, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  const distText =
    calculations.shootingDistanceCm >= 200
      ? '200+ cm (Infini)'
      : `${calculations.shootingDistanceCm} cm`;
  doc.text(`Distance de prise de vue : ${distText}`, pageWidth - margin - 4, y + 7, { align: 'right' });

  y += 16;

  // --- SECTION 1: ANNOTATED PHOTO ---
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('1. Cliché Biométrique Annoté', margin, y);
  y += 3.5;

  // Fit annotated image cleanly inside max width & height
  const maxImgW = contentWidth;
  const maxImgH = 88;
  const imgRatio = annotated.width / annotated.height;
  let drawW = maxImgW;
  let drawH = drawW / imgRatio;
  if (drawH > maxImgH) {
    drawH = maxImgH;
    drawW = drawH * imgRatio;
  }
  const imgX = margin + (contentWidth - drawW) / 2;

  // Frame behind image
  doc.setFillColor(2, 6, 23);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, drawH + 4, 2.5, 2.5, 'FD');

  doc.addImage(annotated.dataUrl, 'JPEG', imgX, y + 2, drawW, drawH);
  y += drawH + 8;

  // Technical calibration sub-caption
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Échelle : ${calculations.scaleMmPerPixel.toFixed(4)} mm/px  |  Carte détectée : ${Math.round(calculations.cardWidthPixels)} px (${calculations.cardWidthMm.toFixed(2)} mm)  |  Mesure brute à ${calculations.shootingDistanceCm} cm : ${calculations.measuredPdAtShootingDistance} mm`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );
  y += 8;

  // --- SECTION 2: KEY METRIC SUMMARY BOXES ---
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('2. Synthèse des Écarts Pupillaires', margin, y);
  y += 4;

  const boxGap = 3.5;
  const boxW = (contentWidth - boxGap * 3) / 4;
  const boxH = 26;

  const cards = [
    {
      title: 'ÉCART TOTAL (VL)',
      value: `${calculations.totalPdDistance} mm`,
      sub: 'Vision de loin (Infini)',
      accent: [225, 29, 72] as [number, number, number],
    },
    {
      title: 'DEMI-ÉCART DROIT (OD)',
      value: `${calculations.rightMonocularPd} mm`,
      sub: 'Pupille droite / Nez',
      accent: [190, 18, 60] as [number, number, number],
    },
    {
      title: 'DEMI-ÉCART GAUCHE (OG)',
      value: `${calculations.leftMonocularPd} mm`,
      sub: 'Pupille gauche / Nez',
      accent: [8, 145, 178] as [number, number, number],
    },
    {
      title: 'VISION DE PRÈS (VP)',
      value: `${calculations.nearVisionPd} mm`,
      sub: 'Lecture (40 cm)',
      accent: [79, 70, 229] as [number, number, number],
    },
  ];

  cards.forEach((card, idx) => {
    const bx = margin + idx * (boxW + boxGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(bx, y, boxW, boxH, 2, 2, 'FD');

    // Top accent line
    doc.setFillColor(card.accent[0], card.accent[1], card.accent[2]);
    doc.rect(bx, y, boxW, 1.5, 'F');

    doc.setTextColor(card.accent[0], card.accent[1], card.accent[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(card.title, bx + 3, y + 6.5);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(card.value, bx + 3, y + 15.5);

    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.text(card.sub, bx + 3, y + 22);
  });

  y += boxH + 9;

  // --- SECTION 3: DETAILED PRESCRIPTION TABLE ---
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('3. Tableau Détaillé de Centrage Optique', margin, y);
  y += 4;

  const colWidths = [46, 27, 27, 30, 52]; // total = 182 = contentWidth
  const headers = ['Type de Vision', 'Œil Droit (OD)', 'Œil Gauche (OG)', 'Écart Total', 'Usage Recommandé'];

  // Table header
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentWidth, 9, 'FD');
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);

  let cx = margin;
  headers.forEach((h, i) => {
    doc.text(h, cx + 2.5, y + 6);
    cx += colWidths[i];
  });
  y += 9;

  const viRight = (calculations.rightMonocularPd * (650 / 675)).toFixed(2);
  const viLeft = (calculations.leftMonocularPd * (650 / 675)).toFixed(2);
  const vpRight = (calculations.rightMonocularPd * (400 / 425)).toFixed(2);
  const vpLeft = (calculations.leftMonocularPd * (400 / 425)).toFixed(2);

  const rows = [
    [
      'Vision de Loin (VL - Infini)',
      `${calculations.rightMonocularPd} mm`,
      `${calculations.leftMonocularPd} mm`,
      `${calculations.totalPdDistance} mm`,
      'Lunettes de vue, conduite, progressifs',
    ],
    [
      'Vision Intermédiaire (65 cm)',
      `${viRight} mm`,
      `${viLeft} mm`,
      `${calculations.intermediateVisionPd} mm`,
      'Écran ordinateur, travail de bureau',
    ],
    [
      'Vision de Près (VP - 40 cm)',
      `${vpRight} mm`,
      `${vpLeft} mm`,
      `${calculations.nearVisionPd} mm`,
      'Lunettes de lecture, verres dégressifs',
    ],
  ];

  rows.forEach((row, rIdx) => {
    const rowH = 9.5;
    if (rIdx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, rowH, 'FD');
    } else {
      doc.setFillColor(255, 255, 255);
      doc.rect(margin, y, contentWidth, rowH, 'FD');
    }

    let rx = margin;
    row.forEach((cell, cIdx) => {
      doc.setFont('helvetica', cIdx === 0 || cIdx === 3 ? 'bold' : 'normal');
      doc.setFontSize(cIdx === 4 ? 7.5 : 8.2);
      doc.setTextColor(cIdx === 3 ? 15 : 51, cIdx === 3 ? 23 : 65, cIdx === 3 ? 42 : 85);
      doc.text(cell, rx + 2.5, y + 6);
      rx += colWidths[cIdx];
    });
    y += rowH;
  });

  y += 8;

  // --- SECTION 4: OPTICAL & PHYSIOLOGICAL CONTROLS ---
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('4. Contrôle Physiologique & Compensation Optique', margin, y);
  y += 4;

  const infoBoxH = calculations.physiologicalWarning ? 34 : 26;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, infoBoxH, 2, 2, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.3);
  doc.setTextColor(51, 65, 85);

  const statusLabel = calculations.isPhysiologicallyNormal
    ? 'Conforme à la plage physiologique adulte normale (54.00 mm - 74.00 mm, moyenne 63.5 mm).'
    : 'Valeur hors plage standard adulte (54.00 mm - 74.00 mm) : vérification recommandée.';

  doc.text(`• Statut physiologique : ${statusLabel}`, margin + 4, y + 6.5);
  doc.text(
    `• Symétrie faciale (écart OD / OG) : Différence de ${calculations.symmetryDifferenceMm} mm`,
    margin + 4,
    y + 13
  );
  doc.text(
    `• Compensation de convergence : +${calculations.convergenceCorrectionMm} mm appliqués (mesure brute ${calculations.measuredPdAtShootingDistance} mm à ${distText})`,
    margin + 4,
    y + 19.5
  );

  if (calculations.physiologicalWarning) {
    doc.setTextColor(180, 83, 9); // amber-700
    doc.setFont('helvetica', 'bold');
    const splitWarn = doc.splitTextToSize(`Alerte : ${calculations.physiologicalWarning}`, contentWidth - 8);
    doc.text(splitWarn, margin + 4, y + 26);
  }

  // --- FOOTER ---
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'OptiPD • Document de centrage pupillaire généré automatiquement. Ne remplace pas un examen ophtalmologique médical.',
    pageWidth / 2,
    pageHeight - 10,
    { align: 'center' }
  );

  // Build clean filename
  const safeName = patientName?.trim()
    ? patientName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
    : 'mesure';
  const fileDate = now.toISOString().slice(0, 10);
  doc.save(`OptiPD-${safeName}-${fileDate}.pdf`);
}
