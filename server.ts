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

const DETECTION_PROMPT = `Tu es un système expert en vision par ordinateur pour l'optométrie et l'ophtalmologie.
Analyse cette photographie haute résolution d'un visage avec une carte bancaire standard (format ID-1: 85.60 mm x 53.98 mm) posée sur le front.

Objectif : Détecter avec une précision chirurgicale millimétrique :
1. Les limites de la carte de référence (carte bancaire ID-1) sur le front :
   - card_left (bord gauche de la carte, [0, 1])
   - card_right (bord droit de la carte, [0, 1])
   - card_top (bord supérieur de la carte, [0, 1])
   - card_bottom (bord inférieur de la carte, [0, 1])
2. La pupille de l'œil droit du patient (OD - situé à GAUCHE sur la photo du point de vue observateur) :
   - x: coordonnée horizontale normalisée [0, 1]
   - y: coordonnée verticale normalisée [0, 1]
3. La pupille de l'œil gauche du patient (OG - situé à DROITE sur la photo du point de vue observateur) :
   - x: coordonnée horizontale normalisée [0, 1]
   - y: coordonnée verticale normalisée [0, 1]
4. Le centre du pont du nez (nose_bridge) :
   - point osseux central de l'arête nasale, situé exactement sur la ligne médiane entre les deux yeux à hauteur des pupilles.
   - x: coordonnée horizontale normalisée [0, 1]
   - y: coordonnée verticale normalisée [0, 1]

ATTENTION RÈGLE D'OR OPTOMÉTRIQUE :
- Vise impérativement le CENTRE NOIR exact de la pupille et de l'iris.
- NE CONFONDS PAS avec les coins internes des yeux (canthus interne / caroncule lacrymale) qui induisent une fausse mesure aberrante (~45 mm). Le centre pupillaire est au milieu de l'iris rond.
- Pour la carte, prends la largeur totale visible entre les bords gauche et droit les plus nets.`;

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

async function detectWithGemini(cleanBase64: string, mimeType: string) {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new Error("La clé GEMINI_API_KEY n'est pas configurée côté serveur.");
  }

  const ai = getGeminiClient();
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
          text: DETECTION_PROMPT,
        },
      ],
    },
    config: {
      systemInstruction:
        'Tu es un algorithme de détection optométrique ultra-précis. Tu réponds UNIQUEMENT en JSON valide respectant le schéma demandé.',
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
            description: "Centre de la pupille droite du sujet (à gauche sur l'image)",
            properties: {
              x: { type: Type.NUMBER, description: 'Coordonnée X [0, 1]' },
              y: { type: Type.NUMBER, description: 'Coordonnée Y [0, 1]' },
            },
            required: ['x', 'y'],
          },
          left_pupil: {
            type: Type.OBJECT,
            description: "Centre de la pupille gauche du sujet (à droite sur l'image)",
            properties: {
              x: { type: Type.NUMBER, description: 'Coordonnée X [0, 1]' },
              y: { type: Type.NUMBER, description: 'Coordonnée Y [0, 1]' },
            },
            required: ['x', 'y'],
          },
          nose_bridge: {
            type: Type.OBJECT,
            description: 'Point central du pont du nez entre les deux yeux',
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
            description: 'Vrai si la carte de référence a été identifiée sur le front',
          },
          notes: {
            type: Type.STRING,
            description: 'Remarque optométrique éventuelle (ex: éclairage, symétrie)',
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

async function detectWithDeepSeek(cleanBase64: string, mimeType: string) {
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

  const deepseekPrompt = `${DETECTION_PROMPT}

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
  "notes": "Remarque éventuelle"
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
            'Tu es un algorithme de détection optométrique ultra-précis. Tu réponds UNIQUEMENT en JSON valide sans texte ni balises markdown autour.',
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
    } = req.body as {
      imageBase64?: string;
      mimeType?: string;
      provider?: 'auto' | 'gemini' | 'deepseek';
    };

    if (!imageBase64) {
      return res.status(400).json({ error: 'Aucune image fournie.' });
    }

    // Strip prefix if included
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    let parsedData: any;
    let usedProvider: 'gemini' | 'deepseek' = 'gemini';

    if (provider === 'deepseek') {
      usedProvider = 'deepseek';
      parsedData = await detectWithDeepSeek(cleanBase64, mimeType);
    } else if (provider === 'gemini') {
      usedProvider = 'gemini';
      parsedData = await detectWithGemini(cleanBase64, mimeType);
    } else {
      // Auto mode: prefer Gemini if configured, else DeepSeek; fallback if primary fails and secondary is configured
      const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
      const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY?.trim());

      if (hasGemini) {
        try {
          usedProvider = 'gemini';
          parsedData = await detectWithGemini(cleanBase64, mimeType);
        } catch (geminiErr) {
          if (hasDeepSeek) {
            usedProvider = 'deepseek';
            parsedData = await detectWithDeepSeek(cleanBase64, mimeType);
          } else {
            throw geminiErr;
          }
        }
      } else if (hasDeepSeek) {
        usedProvider = 'deepseek';
        parsedData = await detectWithDeepSeek(cleanBase64, mimeType);
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
