
import OpenAI from "openai";

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

    const { text, mode = "clean" } = req.body || {};

    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        error: "Цэвэрлэх текст оруулна уу."
      });
    }

    if (text.length > 50000) {
      return res.status(413).json({
        error: "Текст хэт урт байна."
      });
    }

    const instructions = {
      clean: `
Чи Монгол хэлний мэргэжлийн редактор.

Доорх ярианаас хөрвүүлсэн текстийг
уншихад ойлгомжтой, цэвэр бичвэр болго.

Дүрэм:
- Монгол кириллээр бич.
- Зөв бичгийн болон цэг тэмдгийн алдааг зас.
- Өгүүлбэр, догол мөрийг зөв хуваа.
- "Аа", "ээ", "нөгөө" зэрэг утгагүй давталтыг цэвэрлэ.
- Хүний хэлсэн санааг өөрчилж болохгүй.
- Шинэ мэдээлэл зохиож болохгүй.
- Нэр, тоо, мөнгө, огноог дур мэдэн өөрчилж болохгүй.
- Эргэлзээтэй мэдээллийг таамгаар нөхөж болохгүй.
- Зөвхөн эцсийн цэвэрлэсэн текстийг буцаа.
`,
      summary: `
Чи Монгол хэл дээр хурлын тэмдэглэл,
ярилцлага болон лекцийн хураангуй гаргадаг туслах.

Оруулсан текстээс:
1. Гол агуулга
2. Чухал мэдээлэл
3. Гарсан шийдвэр (байгаа бол)
4. Хийх ажлууд (байгаа бол)

гэсэн бүтэцтэй хураангуй гарга.

Байхгүй мэдээлэл, шийдвэр, хугацаа,
хариуцагчийг зохиож болохгүй.
Монгол кириллээр бич.
`
    };

    if (!["clean", "summary"].includes(mode)) {
      return res.status(400).json({
        error: "Буруу боловсруулалтын төрөл."
      });
    }

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      instructions: instructions[mode],
      input: text,
      max_output_tokens: 12000
    });

    return res.status(200).json({
      text: response.output_text || ""
    });

  } catch (error) {
    console.error("AI cleanup error:", error);

    return res.status(500).json({
      error: "AI текст боловсруулахад алдаа гарлаа."
    });
  }
}
