
import OpenAI from "openai";
import { toFile } from "openai/uploads";

export const config = {
  api: {
    bodyParser: false
  }
};

const MAX_BYTES = 4 * 1024 * 1024;

function detectAudio(buffer) {
  if (buffer.length < 12) return null;

  // M4A / MP4
  if (buffer.toString("ascii", 4, 8) === "ftyp") {
    return {
      ext: "m4a",
      mime: "audio/mp4"
    };
  }

  // MP3 with ID3 metadata
  if (buffer.toString("ascii", 0, 3) === "ID3") {
    return {
      ext: "mp3",
      mime: "audio/mpeg"
    };
  }

  // MP3 without ID3
  if (
    buffer[0] === 0xff &&
    (buffer[1] & 0xe0) === 0xe0
  ) {
    return {
      ext: "mp3",
      mime: "audio/mpeg"
    };
  }

  // WAV
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  ) {
    return {
      ext: "wav",
      mime: "audio/wav"
    };
  }

  // OGG
  if (buffer.toString("ascii", 0, 4) === "OggS") {
    return {
      ext: "ogg",
      mime: "audio/ogg"
    };
  }

  // FLAC
  if (buffer.toString("ascii", 0, 4) === "fLaC") {
    return {
      ext: "flac",
      mime: "audio/flac"
    };
  }

  // WebM
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return {
      ext: "webm",
      mime: "audio/webm"
    };
  }

  return null;
}

async function readRawBody(req) {
  // Vercel may expose the original raw request body.
  if (req.body instanceof Buffer) {
    return req.body;
  }

  if (req.body instanceof Uint8Array) {
    return Buffer.from(req.body);
  }

  if (typeof req.body === "string") {
    return Buffer.from(req.body, "binary");
  }

  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk);

    total += part.length;

    if (total > MAX_BYTES) {
      const error = new Error("FILE_TOO_LARGE");
      error.status = 413;
      throw error;
    }

    chunks.push(part);
  }

  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST хүсэлт шаардлагатай."
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "OpenAI API key тохируулаагүй байна."
    });
  }

  const declaredSize = Number(
    req.headers["content-length"] || 0
  );

  if (declaredSize > MAX_BYTES) {
    return res.status(413).json({
      error: "4 MB-аас жижиг файл оруулна уу."
    });
  }

  try {
    const buffer = await readRawBody(req);

    if (!buffer.length) {
      return res.status(400).json({
        error: "Аудионы өгөгдөл хоосон ирлээ."
      });
    }

    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({
        error: "4 MB-аас жижиг файл оруулна уу."
      });
    }

    const detected = detectAudio(buffer);

    console.log("Audio diagnostic:", {
      bytes: buffer.length,
      contentType: req.headers["content-type"],
      signature: buffer.subarray(0, 12).toString("hex"),
      detected: detected?.ext || "unknown"
    });

    if (!detected) {
      return res.status(400).json({
        error:
          "Аудионы жинхэнэ формат танигдсангүй. " +
          "MP3, M4A, WAV, OGG эсвэл WebM файл оруулна уу."
      });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const audioFile = await toFile(
      buffer,
      `recording.${detected.ext}`,
      { type: detected.mime }
    );

    const result = await openai.audio.transcriptions.create({
      file: audioFile,
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
    console.error("Transcription error:", {
      message: error.message,
      status: error.status,
      code: error.code
    });

    if (error.message === "FILE_TOO_LARGE") {
      return res.status(413).json({
        error: "Файлын хэмжээ 4 MB-аас их байна."
      });
    }

    if (error.status === 429) {
      return res.status(429).json({
        error: "OpenAI API кредит эсвэл хүсэлтийн хязгаар хүрсэн."
      });
    }

    return res.status(500).json({
      error: "Аудио хөрвүүлэхэд алдаа гарлаа."
    });
  }
}
