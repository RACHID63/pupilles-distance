import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  OptometricCalculations,
  SavedMeasurement,
  Point2D,
  CardBounds,
} from '../types/optometry';
import {
  CheckCircle2,
  Copy,
  Printer,
  Save,
  AlertTriangle,
  RotateCcw,
  Eye,
  ArrowRight,
  BookmarkCheck,
  Ruler,
  Laptop,
} from 'lucide-react';

interface Props {
  imageUrl: string;
  calculations: OptometricCalculations;
  points: {
    rightPupil: Point2D;
    leftPupil: Point2D;
    noseBridge: Point2D;
    cardBounds: CardBounds;
  };
  onSaveToHistory: (measurement: SavedMeasurement) => void;
  onModifyAdjustment: () => void;
  onNewMeasurement: () => void;
}

export const ResultsReport: React.FC<Props> = ({
  imageUrl,
  calculations,
  points,
  onSaveToHistory,
  onModifyAdjustment,
  onNewMeasurement,
}) => {
  const [patientName, setPatientName] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  // Trigger celebration confetti
  useEffect(() => {
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.65 },
      colors: ['#FF1744', '#00E5FF', '#10B981', '#F59E0B'],
    });
  }, []);

  // Format text for online optician copy
  const getOpticianSummaryText = () => {
    return `Rapport de Centrage Pupillaire (OptiPD)
----------------------------------------
Distance de prise de vue     : ${calculations.shootingDistanceCm >= 200 ? '200+ cm (Infini)' : `${calculations.shootingDistanceCm} cm`}
Correction de convergence    : +${calculations.convergenceCorrectionMm} mm vers l'infini

ÉCART PUPILLAIRE VISION DE LOIN (VL - Infini) : ${calculations.totalPdDistance} mm
• Demi-écart Droit (OD)      : ${calculations.rightMonocularPd} mm
• Demi-écart Gauche (OG)     : ${calculations.leftMonocularPd} mm

VISION INTERMÉDIAIRE (VI - Écran 65 cm)       : ${calculations.intermediateVisionPd} mm
VISION DE PRÈS (VP - Lecture 40 cm)           : ${calculations.nearVisionPd} mm

Mesure brute à ${calculations.shootingDistanceCm} cm              : ${calculations.measuredPdAtShootingDistance} mm
Différence de symétrie faciale                : Δ ${calculations.symmetryDifferenceMm} mm
Date de mesure                               : ${new Date().toLocaleDateString('fr-FR')}`;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getOpticianSummaryText());
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch (e) {
      console.warn('Clipboard copy error:', e);
    }
  };

  const handleSave = () => {
    if (isSaved) return;
    const measurement: SavedMeasurement = {
      id: `pd_${Date.now()}`,
      timestamp: Date.now(),
      name: patientName.trim() || `Mesure du ${new Date().toLocaleDateString('fr-FR')}`,
      imageUrl,
      calculations,
      points,
    };
    onSaveToHistory(measurement);
    setIsSaved(true);
  };

  const handlePrint = () => {
    window.print();
  };

  // Calculate percentage along physiological gauge [48mm, 80mm]
  const minGauge = 48;
  const maxGauge = 80;
  const gaugePercent = Math.max(
    0,
    Math.min(100, ((calculations.totalPdDistance - minGauge) / (maxGauge - minGauge)) * 100)
  );

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 pb-12 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900 to-teal-950/60 border border-emerald-500/30 p-5 rounded-3xl shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold text-white">Résultats Optométriques Validés</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Précision Millimétrique
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Mesures d'écart pupillaire calculées avec étalonnage ISO/IEC 7810 ID-1 et compensation de convergence à {calculations.shootingDistanceCm} cm.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onModifyAdjustment}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <RotateCcw className="w-4 h-4 text-cyan-400" />
            <span>Réajuster repères</span>
          </button>
          <button
            onClick={onNewMeasurement}
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-rose-900/40 transition"
          >
            <span>Nouvelle mesure</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* NEW: Shooting Distance & Convergence Note Banner */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300 shadow">
        <div className="flex items-center gap-2.5">
          <Ruler className="w-4 h-4 text-cyan-400" />
          <span>
            Distance de prise de vue : <strong className="text-white font-mono">{calculations.shootingDistanceCm} cm</strong>
          </span>
          <span className="text-slate-600">•</span>
          <span>
            Mesure brute convergente : <span className="font-mono text-slate-400">{calculations.measuredPdAtShootingDistance} mm</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Convergence compensée : +{calculations.convergenceCorrectionMm} mm vers l'infini (VL)</span>
        </div>
      </div>

      {/* Main Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Far PD */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Écart Total (VL)
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
          </div>
          <div className="my-3">
            <div className="flex items-baseline">
              <span className="text-4xl font-black font-mono text-white tracking-tight">
                {calculations.totalPdDistance}
              </span>
              <span className="text-sm font-bold text-rose-400 ml-1.5">mm</span>
            </div>
            <span className="text-[11px] text-slate-400 block mt-1">
              Vision de Loin Réelle (Infini)
            </span>
          </div>
          <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-800/80">
            Moyenne adulte : 63.5 mm
          </div>
        </div>

        {/* Card 2: Monocular OD */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">
              Demi-Écart OD
            </span>
            <span className="text-[10px] font-mono font-bold bg-rose-500/10 text-rose-300 px-2 py-0.5 rounded">
              Œil Droit
            </span>
          </div>
          <div className="my-3">
            <div className="flex items-baseline">
              <span className="text-4xl font-black font-mono text-rose-400 tracking-tight">
                {calculations.rightMonocularPd}
              </span>
              <span className="text-sm font-bold text-slate-400 ml-1.5">mm</span>
            </div>
            <span className="text-[11px] text-slate-400 block mt-1">
              Pupille Droite ↔ Pont du Nez
            </span>
          </div>
          <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-800/80">
            Centrage verres unifocaux & progressifs
          </div>
        </div>

        {/* Card 3: Monocular OG */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
              Demi-Écart OG
            </span>
            <span className="text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-300 px-2 py-0.5 rounded">
              Œil Gauche
            </span>
          </div>
          <div className="my-3">
            <div className="flex items-baseline">
              <span className="text-4xl font-black font-mono text-cyan-400 tracking-tight">
                {calculations.leftMonocularPd}
              </span>
              <span className="text-sm font-bold text-slate-400 ml-1.5">mm</span>
            </div>
            <span className="text-[11px] text-slate-400 block mt-1">
              Pupille Gauche ↔ Pont du Nez
            </span>
          </div>
          <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-800/80">
            Centrage verres unifocaux & progressifs
          </div>
        </div>

        {/* Card 4: Near Vision & Intermediate PD */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
              Vision Près & Écran
            </span>
            <span className="text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded">
              VP / VI
            </span>
          </div>
          <div className="my-3 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-400">Lecture (40cm) :</span>
              <div>
                <span className="text-2xl font-black font-mono text-indigo-400">
                  {calculations.nearVisionPd}
                </span>
                <span className="text-xs text-slate-400 ml-1">mm</span>
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-400">Écran (65cm) :</span>
              <div>
                <span className="text-lg font-bold font-mono text-teal-400">
                  {calculations.intermediateVisionPd}
                </span>
                <span className="text-xs text-slate-400 ml-1">mm</span>
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-800/80">
            Pour verres dégressifs & de lecture
          </div>
        </div>
      </div>

      {/* Physiological Normality Gauge */}
      <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-3xl shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-400" />
              Contrôle Physiologique & Normes Optométriques
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Évaluation statistique de l'écart pupillaire par rapport à la population adulte
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
              calculations.isPhysiologicallyNormal
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            }`}
          >
            {calculations.isPhysiologicallyNormal ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Zone Normale (54 - 74 mm)</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Valeur Atypique</span>
              </>
            )}
          </span>
        </div>

        {/* Visual Gauge Bar */}
        <div className="relative pt-6 pb-2">
          {/* Needle indicator */}
          <div
            className="absolute top-0 -translate-x-1/2 flex flex-col items-center transition-all duration-500"
            style={{ left: `${gaugePercent}%` }}
          >
            <span className="text-xs font-mono font-bold text-white bg-rose-600 px-2 py-0.5 rounded shadow-lg whitespace-nowrap">
              {calculations.totalPdDistance} mm
            </span>
            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-rose-600" />
          </div>

          {/* Bar gradient tracks */}
          <div className="w-full h-3 rounded-full bg-slate-950 overflow-hidden flex border border-slate-800">
            {/* Narrow section [48, 54] */}
            <div className="h-full bg-amber-500/40" style={{ width: `${((54 - 48) / (80 - 48)) * 100}%` }} />
            {/* Standard adult section [54, 74] */}
            <div className="h-full bg-emerald-500/80" style={{ width: `${((74 - 54) / (80 - 48)) * 100}%` }} />
            {/* Wide section [74, 80] */}
            <div className="h-full bg-amber-500/40" style={{ width: `${((80 - 74) / (80 - 48)) * 100}%` }} />
          </div>

          {/* Scale labels */}
          <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-2">
            <span>48 mm</span>
            <span className="text-emerald-400">54 mm (Min normale)</span>
            <span className="font-bold text-slate-300">63.5 mm (Moyenne)</span>
            <span className="text-emerald-400">74 mm (Max normale)</span>
            <span>80 mm</span>
          </div>
        </div>

        {/* Symmetry feedback */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">Symétrie Faciale :</span>
            <span>
              Différence OD/OG de <strong className="text-rose-400 font-mono">{calculations.symmetryDifferenceMm} mm</strong>.
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            {calculations.symmetryDifferenceMm <= 0.5
              ? '✨ Symétrie quasi parfaite'
              : calculations.symmetryDifferenceMm <= 1.5
              ? '👍 Légère asymétrie naturelle standard'
              : 'ℹ️ Asymétrie notable (fréquente, les demi-écarts sont indispensables pour vos verres)'}
          </span>
        </div>
      </div>

      {/* Printable Optometric Prescription Slip */}
      <div className="bg-white text-slate-900 p-6 sm:p-8 rounded-3xl shadow-2xl border border-slate-200 printable-slip space-y-6">
        <div className="flex items-start justify-between pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-rose-600 tracking-tight">OptiPD</span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                • Fiche de Centrage Optique
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Certificat de mesure conforme aux normes optométriques (ISO 7810 ID-1)
            </p>
          </div>
          <div className="text-right text-xs text-slate-500 font-mono">
            <div>Date : {new Date().toLocaleDateString('fr-FR')}</div>
            <div className="text-[10px] text-slate-400">Réf : {Date.now().toString(36).toUpperCase()}</div>
          </div>
        </div>

        {/* Patient Name field */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-700">Nom / Référence :</span>
          <input
            type="text"
            placeholder="Ex: Jean Dupont (optionnel)"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            className="flex-1 max-w-sm px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>

        {/* Prescription Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                <th className="py-2.5 px-3">Type de Mesure</th>
                <th className="py-2.5 px-3">Œil Droit (OD)</th>
                <th className="py-2.5 px-3">Œil Gauche (OG)</th>
                <th className="py-2.5 px-3">Écart Total (PD)</th>
                <th className="py-2.5 px-3">Usage Recommandé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              <tr>
                <td className="py-3 px-3 font-sans font-semibold text-slate-900">
                  Vision de Loin (VL - Infini)
                </td>
                <td className="py-3 px-3 font-bold text-rose-600">{calculations.rightMonocularPd} mm</td>
                <td className="py-3 px-3 font-bold text-cyan-700">{calculations.leftMonocularPd} mm</td>
                <td className="py-3 px-3 font-black text-slate-900 text-sm">
                  {calculations.totalPdDistance} mm
                </td>
                <td className="py-3 px-3 font-sans text-slate-500 text-[11px]">
                  Lunettes vue de loin, conduite, verres progressifs
                </td>
              </tr>
              <tr className="bg-slate-50/60">
                <td className="py-3 px-3 font-sans font-semibold text-slate-900">
                  Vision Intermédiaire (VI - 65 cm)
                </td>
                <td className="py-3 px-3 text-slate-700">
                  {(calculations.rightMonocularPd * (650 / 675)).toFixed(2)} mm
                </td>
                <td className="py-3 px-3 text-slate-700">
                  {(calculations.leftMonocularPd * (650 / 675)).toFixed(2)} mm
                </td>
                <td className="py-3 px-3 font-bold text-teal-700 text-sm">
                  {calculations.intermediateVisionPd} mm
                </td>
                <td className="py-3 px-3 font-sans text-slate-500 text-[11px]">
                  Écran d'ordinateur, musique, tableau de bord
                </td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-sans font-semibold text-slate-900">
                  Vision de Près (VP - 40 cm)
                </td>
                <td className="py-3 px-3 text-slate-700">
                  {(calculations.rightMonocularPd * (400 / 425)).toFixed(2)} mm
                </td>
                <td className="py-3 px-3 text-slate-700">
                  {(calculations.leftMonocularPd * (400 / 425)).toFixed(2)} mm
                </td>
                <td className="py-3 px-3 font-black text-indigo-700 text-sm">
                  {calculations.nearVisionPd} mm
                </td>
                <td className="py-3 px-3 font-sans text-slate-500 text-[11px]">
                  Lunettes de lecture, dégressifs, travail de précision
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Optician online copy helper */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 border-t border-slate-200">
          <span>
            Prise de vue à {calculations.shootingDistanceCm} cm • Compensation convergence : +{calculations.convergenceCorrectionMm} mm
          </span>
          <span className="font-semibold text-slate-700">Valable pour tous les opticiens et sites en ligne</span>
        </div>
      </div>

      {/* Action Buttons Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="flex items-center gap-2">
          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-2 transition"
          >
            {isCopied ? <BookmarkCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-cyan-400" />}
            <span>{isCopied ? 'Copié dans le presse-papier !' : 'Copier pour opticien en ligne'}</span>
          </button>

          {/* Print Prescription */}
          <button
            onClick={handlePrint}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-2 transition"
          >
            <Printer className="w-4 h-4 text-amber-400" />
            <span>Imprimer / PDF</span>
          </button>
        </div>

        {/* Save to History */}
        <button
          onClick={handleSave}
          disabled={isSaved}
          className={`px-5 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 transition shadow-lg ${
            isSaved
              ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 cursor-default'
              : 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white shadow-rose-950/50'
          }`}
        >
          {isSaved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{isSaved ? 'Mesure Enregistrée' : "Enregistrer dans l'historique"}</span>
        </button>
      </div>
    </div>
  );
};
