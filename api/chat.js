// api/chat.js
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { message, history = [] } = req.body || {};
    if (!message) return res.status(400).json({ error: "message is required" });

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    // --- Schema we want to extract ---
    const extractionSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        intent: { type: "string", description: "buy | rent | invest | unknown" },
        city: { type: "string" },
        area: { type: "string" },
        property_type: { type: "string", description: "apartment | villa | townhouse | studio | office | plot | unknown" },
        bedrooms: { type: "string", description: "e.g. 'studio', '1', '2', '3+', 'unknown'" },
        bathrooms: { type: "string" },
        budget: { type: "string", description: "e.g. 'up to 1.5M AED' or 'unknown'" },
        payment: { type: "string", description: "cash | mortgage | installments | unknown" },
        ready_or_offplan: { type: "string", description: "ready | offplan | unknown" },
        handover_date: { type: "string" },
        view: { type: "string", description: "sea | golf | city | park | unknown" },
        amenities: { type: "string", description: "comma-separated list or 'unknown'" },
        timeline: { type: "string", description: "when they want to move/buy" },
        nationality: { type: "string" },
        name: { type: "string" },
        phone_or_whatsapp: { type: "string" },
        notes: { type: "string" }
      },
      required: ["intent","city","area","property_type","bedrooms","budget","ready_or_offplan","notes"]
    };

    // We ask model to output BOTH:
    // 1) natural assistant response
    // 2) extracted structured requirements
    const system = `
أنت شات بوت عقاري ذكي. مهمتك:
1) تحكي مع المستخدم بأسلوب طبيعي وبسيط (عربي غالباً، وإذا المستخدم كتب إنجليزي جاوبه إنجليزي).
2) تفهم من كلامه متطلبات العقار وتستخرجها بدقة.
3) إذا في معلومات ناقصة (مثل المدينة أو الميزانية أو عدد الغرف) اسأل سؤال/سؤالين فقط بشكل ذكي بدل ما تزعجه.
4) في كل رد لازم ترجع:
- assistant_message: الرد اللي رح يشوفه المستخدم
- lead_summary: ملخص قصير جداً ومنظم بسطور (جاهز تبعته للإدارة/السيلز)
- extracted: JSON حسب الـ schema المطلوب

قواعد:
- لا تخترع معلومات. إذا مش مذكور خلّيه 'unknown'.
- لو المستخدم طلب شي غير مفهوم اسأل توضيح.
- خليك مختصر وواضح.
`;

    const messages = [
      { role: "system", content: system },
      ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: message }
    ];

    const payload = {
      model: "gpt-4o-mini",
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "real_estate_bot_response",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              assistant_message: { type: "string" },
              lead_summary: { type: "string" },
              extracted: extractionSchema
            },
            required: ["assistant_message","lead_summary","extracted"]
          }
        }
      },
      temperature: 0.3
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: data?.error || data });

    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
