import express, { Request, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Increase payload limit for high-res photos
app.use(express.json({ limit: '30mb' }));

// Server-side Gemini client
function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildDetectionPrompt(shootingDistanceCm: number): string {
  const distanceMm = shootingDistanceCm * 10;
  return `Tu es un système expert en vision par ordinateur et en optométrie clinique.
Analyse cette photographie haute résolution d'un visage avec une carte bancaire standard (norme ISO/IEC 7810 ID-1 : cotation exacte 85.60 mm de largeur x 53.98 mm de hauteur) posée sur le front.

PARAMÈTRE DE PRISE DE VUE :
- Distance déclarée entre le sujet et l'objectif de l'appareil photo : ${shootingDistanceCm} cm (${distanceMm} mm).
  (Cette distance peut varier selon la prise de vue : 20 cm, 40 cm, 50 cm, 60 cm, 100 cm, etc., et modifie directement la convergence binoculaire.)

MISSION OPTOMÉTRIQUE EN 4 ÉTAPES OBLIGATOIRES :
1. REPÉRAGE DE LA COTATION DE LA CARTE DE RÉFÉRENCE (ID-1 = 85.60 mm) :
   - Détecte précisément les 4 bords de la carte sur le front : card_left, card_right, card_top, card_bottom (coordonnées normalisées [0, 1]).
   - Déduis l'échelle métrique exacte de la photo à partir de la largeur réelle de la carte (85.60 mm / largeur_carte_en_pixels).

2. LOCALISATION DES PUPILLES ET DE LA RACINE DU NEZ :
   - right_pupil (Œil Droit du patient OD, situé à GAUCHE sur la photo) : vise impérativement le CENTRE NOIR exact de la pupille/iris.
   - left_pupil (Œil Gauche du patient OG, situé à DROITE sur la photo) : vise impérativement le CENTRE NOIR exact de la pupille/iris.
   - nose_bridge (Racine du nez / Pont nasal) : point central exact sur l'arête osseuse de la racine du nez, situé exactement sur la ligne médiane faciale à hauteur des deux yeux.
   - ATTENTION RÈGLE D'OR : NE CONFONDS JAMAIS le centre de la pupille avec le coin interne de l'œil (canthus / caroncule lacrymale, qui fausse la mesure autour de ~45 mm).

3. CALCUL DES DISTANCES ANATOMIQUES :
   - Calcule la distance totale entre les deux yeux (Pupille Droite <-> Pupille Gauche) en mm grâce à la cotation de la carte.
   - Calcule le demi-écart monoculaire droit (distance entre la Pupille Droite OD et la racine du nez) en mm.
   - Calcule le demi-écart monoculaire gauche (distance entre la Pupille Gauche OG et la racine du nez) en mm.

4. INTERPRÉTATION SELON LA DISTANCE DU SUJET (${shootingDistanceCm} cm) ET LA COTATION DE LA CARTE :
   - Plus le sujet est proche de l'objectif (ex: 20 cm, 40 cm, 50 cm, 60 cm), plus les axes visuels convergent vers la caméra et réduisent l'écart apparent mesuré sur l'image.
   - Applique la compensation géométrique de convergence (centre de rotation oculaire à 25 mm derrière le plan cornéen/carte) :
     Facteur_VL = (${distanceMm} + 25) / ${distanceMm}
   - Interprète et renseigne dans "ai_interpretation" :
     * raw_pd_mm : écart pupillaire brut mesuré sur la photo à ${shootingDistanceCm} cm
     * far_pd_mm : écart pupillaire total compensé en Vision de Loin (VL à l'infini)
     * right_monocular_mm : demi-écart OD compensé (Pupille Droite <-> racine du nez)
     * left_monocular_mm : demi-écart OG compensé (Pupille Gauche <-> racine du nez)
     * near_pd_mm : écart en Vision de Près (VP à 40 cm)
     * estimated_distance_cm : estimation de la distance réelle sujet-caméra (en cm) d'après la taille apparente de la carte sur l'image
     * summary : brève interprétation clinique en français (mentionnant la cotation de la carte, l'écart total, les deux demi-écarts par rapport à la racine du nez et la convergence à ${shootingDistanceCm} cm).`;
}

function validateDetectionPayload(raw: any) {
  const requiredNums = ['card_left', 'card_right', 'card_top', 'card_bottom'];
  for (const key of requiredNums) {
    if (typeof raw?.[key] !== 'number' || Number.isNaN(raw[key])) {
      throw new Error(`Champ manquant ou invalide dans la détection IA: ${key}`);
    }
  }
  const requiredPts = ['right_pupil', 'left_pupil', 'nose_bridge'];
  for (const key of requiredPts) {
    if (
      typeof raw?.[key]?.x !== 'number' ||
      typeof raw?.[key]?.y !== 'number' ||
      Number.isNaN(raw[key].x) ||
      Number.isNaN(raw[key].y)
    ) {
      throw new Error(`Point manquant ou invalide dans la détection IA: ${key}`);
    }
  }
  return raw;
}

async function detectWithGemini(
  cleanBase64: string,
  mimeType: string,
  shootingDistanceCm: number
) {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new Error("La clé GEMINI_API_KEY n'est pas configurée côté serveur.");
  }

  const ai = getGeminiClient();
  const promptText = buildDetectionPrompt(shootingDistanceCm);

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: cleanBase64,
          },
        },
        {
          text: promptText,
        },
      ],
    },
    config: {
      systemInstruction:
        'Tu es un algorithme expert en optométrie. Tu détectes les repères pupillaires, la racine du nez et la carte ID-1, puis tu interprètes toutes les distances selon la cotation de la carte et la distance de prise de vue. Tu réponds UNIQUEMENT en JSON valide respectant le schéma.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          card_left: {
            type: Type.NUMBER,
            description: 'Position X normalisée [0, 1] du bord gauche de la carte',
          },
          card_right: {
            type: Type.NUMBER,
            description: 'Position X normalisée [0, 1] du bord droit de la carte',
          },
          card_top: {
            type: Type.NUMBER,
            description: 'Position Y normalisée [0, 1] du bord haut de la carte',
          },
          card_bottom: {
            type: Type.NUMBER,
            description: 'Position Y normalisée [0, 1] du bord bas de la carte',
          },
          right_pupil: {
            type: Type.OBJECT,
            description: "Centre noir exact de la pupille droite du sujet (à gauche sur l'image)",
            properties: {
              x: { type: Type.NUMBER, description: 'Coordonnée X [0, 1]' },
              y: { type: Type.NUMBER, description: 'Coordonnée Y [0, 1]' },
            },
            required: ['x', 'y'],
          },
          left_pupil: {
            type: Type.OBJECT,
            description: "Centre noir exact de la pupille gauche du sujet (à droite sur l'image)",
            properties: {
              x: { type: Type.NUMBER, description: 'Coordonnée X [0, 1]' },
              y: { type: Type.NUMBER, description: 'Coordonnée Y [0, 1]' },
            },
            required: ['x', 'y'],
          },
          nose_bridge: {
            type: Type.OBJECT,
            description: 'Point central de la racine du nez (pont nasal) entre les deux yeux',
            properties: {
              x: { type: Type.NUMBER, description: 'Coordonnée X [0, 1]' },
              y: { type: Type.NUMBER, description: 'Coordonnée Y [0, 1]' },
            },
            required: ['x', 'y'],
          },
          confidence: {
            type: Type.NUMBER,
            description: 'Niveau de confiance de la détection entre 0.0 et 1.0',
          },
          card_detected: {
            type: Type.BOOLEAN,
            description: 'Vrai si la carte de référence ID-1 a été identifiée sur le front',
          },
          estimated_distance_cm: {
            type: Type.NUMBER,
            description: 'Distance estimée sujet-caméra en cm d’après la taille de la carte',
          },
          notes: {
            type: Type.STRING,
            description: 'Interprétation optométrique synthétique en français',
          },
          ai_interpretation: {
            type: Type.OBJECT,
            description: 'Calculs et interprétation optométrique par l’IA selon cotation carte et distance',
            properties: {
              raw_pd_mm: { type: Type.NUMBER, description: 'Écart interpupillaire brut mesuré en mm' },
              far_pd_mm: { type: Type.NUMBER, description: 'Écart pupillaire Vision de Loin (VL infini) en mm' },
              right_monocular_mm: { type: Type.NUMBER, description: 'Demi-écart OD (pupille droite <-> racine du nez) en mm' },
              left_monocular_mm: { type: Type.NUMBER, description: 'Demi-écart OG (pupille gauche <-> racine du nez) en mm' },
              near_pd_mm: { type: Type.NUMBER, description: 'Écart pupillaire Vision de Près (40 cm) en mm' },
              summary: { type: Type.STRING, description: 'Résumé de l’interprétation optique' },
            },
          },
        },
        required: [
          'card_left',
          'card_right',
          'card_top',
          'card_bottom',
          'right_pupil',
          'left_pupil',
          'nose_bridge',
        ],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('Réponse vide du modèle Gemini.');
  }
  return validateDetectionPayload(JSON.parse(text));
}

async function detectWithDeepSeek(
  cleanBase64: string,
  mimeType: string,
  shootingDistanceCm: number
) {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "La clé DEEPSEEK_API_KEY n'est pas configurée dans les secrets du serveur (Settings > Secrets)."
    );
  }

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const endpoint = baseUrl.endsWith('/v1')
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/v1/chat/completions`;
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash';

  const deepseekPrompt = `${buildDetectionPrompt(shootingDistanceCm)}

Réponds UNIQUEMENT avec un objet JSON strict respectant exactement ce format :
{
  "card_left": 0.35,
  "card_right": 0.65,
  "card_top": 0.22,
  "card_bottom": 0.38,
  "right_pupil": { "x": 0.389, "y": 0.50 },
  "left_pupil": { "x": 0.611, "y": 0.50 },
  "nose_bridge": { "x": 0.50, "y": 0.51 },
  "confidence": 0.95,
  "card_detected": true,
  "estimated_distance_cm": ${shootingDistanceCm},
  "notes": "Interprétation optométrique en français selon la cotation de la carte et la distance ${shootingDistanceCm} cm.",
  "ai_interpretation": {
    "raw_pd_mm": 61.2,
    "far_pd_mm": 63.8,
    "right_monocular_mm": 31.8,
    "left_monocular_mm": 32.0,
    "near_pd_mm": 60.0,
    "summary": "Explication des écarts entre les yeux et par rapport à la racine du nez."
  }
}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'Tu es un algorithme expert en optométrie. Tu détectes les pupilles, la racine du nez et la carte ID-1, puis tu interprètes les distances selon la cotation de la carte et la distance de prise de vue. Tu réponds UNIQUEMENT en JSON valide sans balises markdown.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: deepseekPrompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${cleanBase64}`,
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(
      `Erreur DeepSeek API (${response.status}): ${errBody || response.statusText}`
    );
  }

  const json: any = await response.json();
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Réponse vide du modèle DeepSeek.');
  }

  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  return validateDetectionPayload(JSON.parse(cleaned));
}

// Returns strictly non-sensitive provider availability booleans (never any key)
app.get('/api/ai-config', (_req: Request, res: Response) => {
  res.json({
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
  });
});

// API endpoint for PD & Card detection (Gemini or DeepSeek, strictly server-side)
app.post('/api/detect-pd', async (req: Request, res: Response) => {
  try {
    const {
      imageBase64,
      mimeType = 'image/jpeg',
      provider = 'auto',
      shootingDistanceCm = 60,
    } = req.body as {
      imageBase64?: string;
      mimeType?: string;
      provider?: 'auto' | 'gemini' | 'deepseek';
      shootingDistanceCm?: number;
    };

    if (!imageBase64) {
      return res.status(400).json({ error: 'Aucune image fournie.' });
    }

    const safeDistanceCm =
      typeof shootingDistanceCm === 'number' && Number.isFinite(shootingDistanceCm)
        ? Math.max(15, Math.min(250, shootingDistanceCm))
        : 60;

    // Strip prefix if included
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    let parsedData: any;
    let usedProvider: 'gemini' | 'deepseek' = 'gemini';

    if (provider === 'deepseek') {
      usedProvider = 'deepseek';
      parsedData = await detectWithDeepSeek(cleanBase64, mimeType, safeDistanceCm);
    } else if (provider === 'gemini') {
      usedProvider = 'gemini';
      parsedData = await detectWithGemini(cleanBase64, mimeType, safeDistanceCm);
    } else {
      // Auto mode: prefer Gemini if configured, else DeepSeek; fallback if primary fails and secondary is configured
      const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
      const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY?.trim());

      if (hasGemini) {
        try {
          usedProvider = 'gemini';
          parsedData = await detectWithGemini(cleanBase64, mimeType, safeDistanceCm);
        } catch (geminiErr) {
          if (hasDeepSeek) {
            usedProvider = 'deepseek';
            parsedData = await detectWithDeepSeek(cleanBase64, mimeType, safeDistanceCm);
          } else {
            throw geminiErr;
          }
        }
      } else if (hasDeepSeek) {
        usedProvider = 'deepseek';
        parsedData = await detectWithDeepSeek(cleanBase64, mimeType, safeDistanceCm);
      } else {
        throw new Error(
          'Aucune clé API IA configurée côté serveur (GEMINI_API_KEY ou DEEPSEEK_API_KEY).'
        );
      }
    }

    return res.json({ success: true, provider: usedProvider, data: parsedData });
  } catch (error: any) {
    console.error('Error in /api/detect-pd:', error);
    return res.status(500).json({
      error: error?.message || 'Erreur lors de la détection optométrique.',
    });
  }
});

function buildDistanceEstimationPrompt(focalConstant: number): string {
  return `Tu es un expert en optique photographique et vision par ordinateur.
Évalue la distance réelle entre l'objectif de la caméra et le visage du sujet sur cette image en combinant 3 indices physiques :
1. CARTE DE RÉFÉRENCE (norme ISO/IEC 7810 ID-1 = 85.60 mm de large) : mesure la fraction normalisée [0..1] de largeur de l'image occupée par la carte (card_width_fraction = card_right - card_left). Formule optique de base : D_cm ≈ ${focalConstant} / card_width_fraction.
2. CONSTANTE BIOLOGIQUE DE L'IRIS (~11.7 mm de diamètre chez l'adulte) : mesure la fraction approximative du diamètre d'un iris par rapport à la largeur de l'image (iris_diameter_fraction) pour croiser et confirmer la distance même si la carte est partiellement inclinée ou absente.
3. INDICE DE PERSPECTIVE GÉOMÉTRIQUE :
   - À très courte distance (15–25 cm), le nez et le front/carte apparaissent fortement agrandis par rapport aux joues/oreilles (effet grand-angle de proximité).
   - À 40–60 cm, proportions naturelles à bras tendu.
   - À 80+ cm, aplatissement de la perspective.

Réponds en JSON strict avec :
- card_width_fraction (nombre entre 0 et 1, ou 0 si carte non visible)
- iris_diameter_fraction (nombre entre 0 et 0.2)
- estimated_distance_cm (entier entre 5 et 250)
- perspective_cue ("contact" | "tres_proche" | "moyenne" | "eloignee")
- confidence (nombre entre 0 et 1)
- explanation (phrase courte en français expliquant le calcul : carte, iris et perspective).`;
}

async function estimateDistanceWithGemini(
  cleanBase64: string,
  mimeType: string,
  focalConstant: number
) {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new Error("La clé GEMINI_API_KEY n'est pas configurée côté serveur.");
  }

  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: {
      parts: [
        { inlineData: { mimeType, data: cleanBase64 } },
        { text: buildDistanceEstimationPrompt(focalConstant) },
      ],
    },
    config: {
      systemInstruction:
        'Tu es un télémètre optique IA. Tu estimes la distance caméra-sujet en combinant la carte ID-1 (85.60 mm), le diamètre d’iris (11.7 mm) et la perspective. Réponds uniquement en JSON valide.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          card_width_fraction: { type: Type.NUMBER },
          iris_diameter_fraction: { type: Type.NUMBER },
          estimated_distance_cm: { type: Type.NUMBER },
          perspective_cue: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          explanation: { type: Type.STRING },
        },
        required: ['estimated_distance_cm', 'explanation'],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error('Réponse vide du télémètre Gemini.');
  return JSON.parse(text);
}

async function estimateDistanceWithDeepSeek(
  cleanBase64: string,
  mimeType: string,
  focalConstant: number
) {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("La clé DEEPSEEK_API_KEY n'est pas configurée côté serveur.");
  }
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const endpoint = baseUrl.endsWith('/v1')
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/v1/chat/completions`;
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'Tu es un télémètre optique IA. Réponds uniquement en JSON valide sans markdown.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildDistanceEstimationPrompt(focalConstant) },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${cleanBase64}` } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Erreur DeepSeek (${response.status}): ${errBody || response.statusText}`);
  }
  const json: any = await response.json();
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Réponse vide du télémètre DeepSeek.');
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

app.post('/api/estimate-distance', async (req: Request, res: Response) => {
  try {
    const {
      imageBase64,
      mimeType = 'image/jpeg',
      provider = 'auto',
      focalConstant = 6.7,
    } = req.body as {
      imageBase64?: string;
      mimeType?: string;
      provider?: 'auto' | 'gemini' | 'deepseek';
      focalConstant?: number;
    };

    if (!imageBase64) {
      return res.status(400).json({ error: 'Aucune image fournie.' });
    }

    const safeFocal =
      typeof focalConstant === 'number' && Number.isFinite(focalConstant)
        ? Math.max(2.5, Math.min(20, focalConstant))
        : 6.7;
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    let data: any;
    let usedProvider: 'gemini' | 'deepseek' = 'gemini';

    if (provider === 'deepseek') {
      usedProvider = 'deepseek';
      data = await estimateDistanceWithDeepSeek(cleanBase64, mimeType, safeFocal);
    } else if (provider === 'gemini') {
      usedProvider = 'gemini';
      data = await estimateDistanceWithGemini(cleanBase64, mimeType, safeFocal);
    } else {
      const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
      const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY?.trim());
      if (hasGemini) {
        try {
          usedProvider = 'gemini';
          data = await estimateDistanceWithGemini(cleanBase64, mimeType, safeFocal);
        } catch (err) {
          if (hasDeepSeek) {
            usedProvider = 'deepseek';
            data = await estimateDistanceWithDeepSeek(cleanBase64, mimeType, safeFocal);
          } else {
            throw err;
          }
        }
      } else if (hasDeepSeek) {
        usedProvider = 'deepseek';
        data = await estimateDistanceWithDeepSeek(cleanBase64, mimeType, safeFocal);
      } else {
        throw new Error('Aucune clé API IA configurée côté serveur.');
      }
    }

    // Refine with calibrated focalConstant if card_width_fraction is valid
    if (
      typeof data?.card_width_fraction === 'number' &&
      data.card_width_fraction > 0.04 &&
      data.card_width_fraction <= 0.98
    ) {
      const opticalCm = Math.round(safeFocal / data.card_width_fraction);
      const aiCm = Number(data.estimated_distance_cm) || opticalCm;
      data.optical_card_distance_cm = Math.max(5, Math.min(250, opticalCm));
      data.estimated_distance_cm = Math.max(
        5,
        Math.min(250, Math.round(opticalCm * 0.65 + aiCm * 0.35))
      );
    }

    return res.json({ success: true, provider: usedProvider, data });
  } catch (error: any) {
    console.error('Error in /api/estimate-distance:', error);
    return res.status(500).json({
      error: error?.message || "Erreur lors de l'estimation de distance par IA.",
    });
  }
});

// Mount Vite or static server
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
