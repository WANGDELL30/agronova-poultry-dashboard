import { z } from 'zod';

export interface ChatTurn {
  question: string;
  answer: string;
}

export interface AssistantInput {
  question: string;
  /** Output of describeSnapshot: the only facts the model may use. */
  snapshotText: string;
  /** Earlier turns with this number, oldest first. */
  history: readonly ChatTurn[];
}

export interface Assistant {
  /** Null when no answer could be produced; the caller then sends the plain status summary. */
  answer(input: AssistantInput): Promise<string | null>;
}

export const SYSTEM_PROMPT = `Anda adalah asisten WhatsApp untuk AgroNova, sistem pemantauan kandang ayam petelur. Anda menjawab pertanyaan petugas kandang tentang kondisi kandang.

Setiap pesan berisi blok <data_kandang>: pembacaan sensor dan hasil kamera terbaru yang baru saja diambil dari sistem. Blok itu adalah satu-satunya sumber fakta Anda. Petugas mengambil keputusan di lapangan berdasarkan jawaban Anda, jadi angka yang keliru atau dikarang bisa merugikan ternak:
- Sebutkan hanya nilai yang tertulis di <data_kandang>. Jika yang ditanyakan tidak ada di sana, katakan datanya tidak tersedia.
- Sensor yang tertulis "tidak ada nilai" memang tidak punya nilai. Jangan menggantinya dengan nol atau perkiraan; sampaikan statusnya (misalnya belum terpasang atau terputus).
- Jika perangkat OFFLINE, nilai yang tertulis adalah nilai lama. Sampaikan bahwa itu bukan kondisi saat ini dan sebutkan kapan perangkat terakhir terlihat.
- Sensor gas MQ-5 belum dikalibrasi. Sampaikan hanya level relatif, ADC, atau tegangan seperti yang tertulis. Jangan menyebut ppm, konsentrasi gas, atau menilai aman/berbahaya dari angka itu.
- Deteksi stres dari kamera adalah pendukung keputusan, bukan diagnosis. Frame yang "tidak dinilai" atau "tidak dapat dinilai" tidak memberi informasi apa pun tentang ayam; jangan menyimpulkannya sebagai tidak stres.
- Sistem belum punya ambang batas resmi untuk suhu, kelembapan, atau gas. Anda boleh menyampaikan nilainya, tetapi jangan menyatakan normal atau tidak normal seolah-olah itu ketentuan sistem.

Anda hanya membaca data. Anda tidak dapat menyalakan, mematikan, atau mengatur perangkat apa pun, dan tidak dapat mengubah pengaturan sistem. Jika diminta, katakan fitur itu belum tersedia.

Blok <riwayat>, jika ada, adalah percakapan sebelumnya dengan petugas yang sama, hanya untuk memahami konteks pertanyaan. Angka di dalamnya mungkin sudah usang; selalu pakai <data_kandang> yang sekarang.

Balasan dibaca di WhatsApp di ponsel: jawab dalam bahasa yang dipakai petugas (umumnya bahasa Indonesia), langsung ke inti, beberapa kalimat pendek saja. Teks biasa tanpa tabel atau heading; *tebal* gaya WhatsApp boleh dipakai seperlunya. Untuk pertanyaan di luar kandang dan sistem ini, jelaskan singkat bahwa Anda hanya membantu soal kondisi kandang.`;

function buildUserMessage(input: AssistantInput): string {
  const parts: string[] = [];
  if (input.history.length > 0) {
    const turns = input.history
      .map((turn) => `Petugas: ${turn.question}\nAsisten: ${turn.answer}`)
      .join('\n\n');
    parts.push(`<riwayat>\n${turns}\n</riwayat>`);
  }
  parts.push(`<data_kandang>\n${input.snapshotText}\n</data_kandang>`);
  parts.push(`Pesan petugas:\n${input.question}`);
  return parts.join('\n\n');
}

// Only the fields the bot reads from an OpenAI-compatible chat completion.
const completionSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable().optional() }) }))
    .min(1),
});

/** Qwen3 and similar models may put their reasoning in the reply inside <think> tags. */
export function stripReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^[\s\S]*<\/think>/i, '')
    .trim();
}

/**
 * MQ-5 is uncalibrated and must never be reported as ppm (AGENTS.md). The snapshot never contains
 * a ppm value, so an answer that mentions ppm either invented one or is discussing a unit the
 * system does not have. Small models follow the prompt less reliably, hence the hard check.
 */
export function violatesSensorRules(answer: string): boolean {
  return /\bppm\b/i.test(answer);
}

export interface OpenAiCompatibleOptions {
  /** Base URL including the version path, e.g. http://localhost:11434/v1 for Ollama. */
  baseUrl: string;
  model: string;
  /** Null for a local server without authentication. */
  apiKey: string | null;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
}

/**
 * Talks to any server that implements the OpenAI chat-completions route (Ollama, vLLM, llama.cpp),
 * so the open-source model can be swapped through configuration alone.
 */
export class OpenAiCompatibleAssistant implements Assistant {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly log: (message: string) => void;

  constructor(private readonly options: OpenAiCompatibleOptions) {
    this.url = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.log = options.log ?? ((message) => console.warn(message));
  }

  async answer(input: AssistantInput): Promise<string | null> {
    // Qwen3 reasons before answering unless told otherwise; "/no_think" is its documented switch.
    // Reasoning would only add latency here: the task is to restate the snapshot.
    const suffix = /^qwen3/i.test(this.options.model) ? ' /no_think' : '';
    let response: Response;
    try {
      // One request per message: history travels as text inside the user turn.
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `${buildUserMessage(input)}${suffix}` },
          ],
          temperature: 0.2,
          max_tokens: 1200,
          stream: false,
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.log(`[assistant] LLM request failed (${reason}); replying with the plain summary.`);
      return null;
    }
    if (!response.ok) {
      this.log(
        `[assistant] LLM server answered ${response.status}; replying with the plain summary.`,
      );
      return null;
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      this.log('[assistant] LLM server returned invalid JSON; replying with the plain summary.');
      return null;
    }
    const parsed = completionSchema.safeParse(body);
    if (!parsed.success) {
      this.log('[assistant] LLM response has no usable choice; replying with the plain summary.');
      return null;
    }
    const text = stripReasoning(parsed.data.choices[0]?.message.content ?? '');
    if (text === '') {
      this.log('[assistant] LLM reply was empty; replying with the plain summary.');
      return null;
    }
    if (violatesSensorRules(text)) {
      this.log('[assistant] LLM reply mentioned ppm; replying with the plain summary instead.');
      return null;
    }
    return text;
  }
}
