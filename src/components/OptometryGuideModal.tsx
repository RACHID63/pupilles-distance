import React from 'react';
import { X, CheckCircle2, AlertTriangle, CreditCard, Eye, ShieldCheck, ArrowRight, Ruler } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const OptometryGuideModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Eye className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight">Guide Optométrique & Protocole</h3>
              <p className="text-xs text-slate-400">Comment obtenir une mesure au dixième de millimètre</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="py-5 space-y-6 text-sm">
          {/* Step 1: Distance and Convergence */}
          <div className="bg-cyan-950/30 rounded-xl p-4 border border-cyan-500/30 space-y-3">
            <div className="flex items-center gap-2 text-cyan-400 font-semibold">
              <Ruler className="w-5 h-5" />
              <span>1. Pourquoi la Distance de Prise de Vue est Capitale ?</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Lorsque vous fixez l'objectif de votre smartphone à bout de bras (<span className="text-white font-semibold">50 à 60 cm</span>), vos yeux <strong className="text-white">convergent naturellement</strong> vers la caméra. L'écart pupillaire mesuré sur la photo brute est donc plus étroit que votre véritable écart en vision de loin (à l'infini).
            </p>
            <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300">
                <span className="font-semibold text-emerald-300">Compensation trigonométrique : </span>
                En renseignant la distance (ex: 60 cm), OptiPD calcule la convergence géométrique grâce au théorème de Thalès et restitue votre <strong className="text-white">vrai écart pupillaire en Vision de Loin (VL à l'infini)</strong>, ainsi que les écarts intermédiaires (écran à 65 cm) et de lecture (40 cm).
              </div>
            </div>
          </div>

          {/* Step 2: Credit Card */}
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/60 space-y-3">
            <div className="flex items-center gap-2 text-rose-400 font-semibold">
              <CreditCard className="w-5 h-5" />
              <span>2. La Carte de Référence (Norme ISO/IEC 7810 ID-1)</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Toutes les cartes bancaires, cartes de fidélité et permis modernes respectent la norme mondiale ID-1 :
              <strong className="text-white ml-1 font-mono">85.60 mm de largeur</strong> par <strong className="text-white font-mono">53.98 mm de hauteur</strong>.
            </p>
            <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300">
                <span className="font-semibold text-emerald-300">Position idéale : </span>
                Plaquez la carte directement <strong className="text-white">contre le front</strong>, juste au-dessus des sourcils. La carte se trouve ainsi dans le plan focal vertical de vos yeux.
              </div>
            </div>
          </div>

          {/* Step 3: The classic anatomical trap */}
          <div className="bg-amber-950/30 rounded-xl p-4 border border-amber-600/30 space-y-3">
            <div className="flex items-center gap-2 text-amber-400 font-semibold">
              <AlertTriangle className="w-5 h-5" />
              <span>3. Le Piège Anatomique du Coin de l'Œil (Canthus)</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              La plupart des applications basiques échouent en pointant le coin interne de l'œil (caroncule lacrymale), ce qui produit un écart erroné d'environ <span className="font-mono text-amber-300 font-semibold">~45 mm</span>.
            </p>
            <div className="bg-slate-950/80 p-3 rounded-lg border border-amber-900/40 text-xs text-slate-300 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>À viser : Le centre noir exact de la pupille (axe optique visuel).</span>
              </div>
              <div className="flex items-center gap-2 text-rose-400 font-medium">
                <X className="w-4 h-4" />
                <span>À éviter : Le coin interne de l'œil (canthus nasal) ou le blanc de la sclère.</span>
              </div>
            </div>
          </div>

          {/* Step 4: Far vs Near PD */}
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/60 space-y-3">
            <div className="flex items-center gap-2 text-indigo-400 font-semibold">
              <ShieldCheck className="w-5 h-5" />
              <span>4. Vision de Loin (VL) vs Vision de Près (VP)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
                <span className="font-bold text-cyan-300 block mb-1">Écart Vision de Loin (VL)</span>
                Pour les lunettes de conduite, cinéma, sport, vision générale. Les yeux fixent l'horizon en axes parallèles (valeur normale adulte : 54 à 74 mm, moyenne 63.5 mm).
              </div>
              <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
                <span className="font-bold text-indigo-300 block mb-1">Écart Vision de Près (VP)</span>
                Pour les lunettes de lecture, ordinateur et le bas des verres progressifs. En convergence, les pupilles se rapprochent d'environ <strong className="text-white">3.0 mm</strong>.
              </div>
            </div>
          </div>

          {/* Step 5: Voice command */}
          <div className="bg-rose-950/20 rounded-xl p-4 border border-rose-500/20 text-xs space-y-2">
            <div className="text-rose-400 font-semibold flex items-center gap-2">
              <span>🎤 Commande Vocale Mains Libres</span>
            </div>
            <p className="text-slate-300">
              Lorsque la caméra est active, vous n'avez pas besoin de toucher l'écran. Il vous suffit de prononcer <strong className="text-white">« Photo »</strong> ou <strong className="text-white">« Cheese »</strong>. L'appareil déclenche automatiquement le cliché après confirmation vocale.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-medium shadow-lg shadow-rose-900/30 flex items-center gap-2 transition"
          >
            <span>J'ai compris, commencer</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
