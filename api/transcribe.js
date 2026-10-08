
import OpenAI from "openai";
import { toFile } from "openai/uploads";

export const config = {
  api: {
    bodyParser: false
  }
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST хүсэлт шаардлагатай."
    });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY тохируулаагүй байна."
      });
    }

    const contentType = req.headers["content-type"] || "";

    if (!contentType.startsWith("audio/") &&
        !contentType.startsWith("video/") &&
        contentType !== "application/octet-stream") {
      return res.status(400).json({
        error: "Аудио файл илгээнэ үү."
      });
    }

    const chunks = [];
    let total = 0;

    for await (const chunk of req) {
      total += chunk.length;

      if (total > 4 * 1024 * 1024) {
        return res.status(413).json({
          error: "Туршилтад 4 MB-аас жижиг файл оруулна уу."
        });
      }

      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);

    if (!buffer.length) {
      return res.status(400).json({
        error: "Файл хоосон байна."
      });
    }

    const mime = contentType.split(";")[0];
    const extensions = {
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/mp4": "m4a",
      "audio/x-m4a": "m4a",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
      "audio/webm": "webm",
      "video/mp4": "mp4",
      "application/octet-stream": "mp3"
    };

    const ext = extensions[mime];

    if (!ext) {
      return res.status(400).json({
        error: "Энэ файлын формат дэмжигдэхгүй байна."
      });
    }

    const file = await toFile(buffer, `recording.${ext}`, {
      type: mime === "application/octet-stream"
        ? "audio/mpeg"
        : mime
    });

  const result = await openai.audio.transcriptions.create({
  file,
  model: "whisper-1",
  response_format: "verbose_json",
  timestamp_granularities: ["segment"]
});

    return res.status(200).json({
      text: result.text || "",
      segments: (result.segments || []).map(s => ({
        start: s.start,
        end: s.end,
        text: s.text
      })),
      duration: result.duration || null
    });

  } catch (error) {
    console.error("Transcription error:", error);
    return res.status(500).json({
      error: "Аудио хөрвүүлэхэд алдаа гарлаа."
    });
  }
}
