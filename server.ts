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
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// API endpoint for PD & Card detection
app.post('/api/detect-pd', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Aucune image fournie.' });
    }

    // Strip prefix if included
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const promptText = `Tu es un système expert en vision par ordinateur pour l'optométrie et l'ophtalmologie.
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
              description: "Point central du pont du nez entre les deux yeux",
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
      throw new Error('Réponse vide du modèle d’intelligence artificielle.');
    }

    const parsedData = JSON.parse(text);
    return res.json({ success: true, data: parsedData });
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
