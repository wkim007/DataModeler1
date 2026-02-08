import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import OpenAI from "openai";

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not set.");
}

const client = new MongoClient(uri);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const app = express();
const PORT = process.env.PORT || 3001;
const DB_NAME = process.env.DB_NAME || "modeler";
const COLLECTION = "myModeler-data";

const DB_TYPES = {
  postgresql: [
    "smallint",
    "integer",
    "bigint",
    "serial",
    "bigserial",
    "numeric",
    "decimal",
    "real",
    "double precision",
    "money",
    "varchar",
    "text",
    "char",
    "boolean",
    "date",
    "time",
    "timestamp",
    "timestamptz",
    "interval",
    "uuid",
    "json",
    "jsonb",
    "bytea",
  ],
  databricks: [
    "tinyint",
    "int",
    "bigint",
    "float",
    "double",
    "decimal",
    "boolean",
    "string",
    "binary",
    "date",
    "timestamp",
    "array",
    "map",
    "struct",
  ],
  oracle: [
    "number",
    "varchar2",
    "nvarchar2",
    "char",
    "nchar",
    "date",
    "timestamp",
    "timestamp with time zone",
    "clob",
    "blob",
    "raw",
    "long",
    "float",
  ],
  mssql: [
    "tinyint",
    "smallint",
    "int",
    "bigint",
    "decimal",
    "numeric",
    "money",
    "float",
    "real",
    "bit",
    "char",
    "varchar",
    "nvarchar",
    "text",
    "ntext",
    "date",
    "datetime",
    "datetime2",
    "datetimeoffset",
    "time",
    "uniqueidentifier",
    "binary",
    "varbinary",
  ],
};

app.use(cors());
app.use(express.json({ limit: "1mb" }));

async function getCollection() {
  if (!client.topology?.isConnected()) {
    await client.connect();
  }
  const db = client.db(DB_NAME);
  return db.collection(COLLECTION);
}

app.get("/api/model", async (req, res) => {
  try {
    const collection = await getCollection();
    const latest = await collection
      .find({})
      .sort({ updatedAt: -1 })
      .limit(1)
      .toArray();
    res.json(latest[0]?.data || null);
  } catch (err) {
    console.error("/api/model failed:", err);
    res.status(500).json({
      error: "Failed to load model.",
      message: err.message,
      name: err.name,
    });
  }
});

app.post("/api/model", async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ error: "Missing data." });
    }
    const collection = await getCollection();
    await collection.insertOne({ data, updatedAt: new Date() });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save model." });
  }
});

app.post("/api/ai-model", async (req, res) => {
  try {
    const { prompt, dbEngine } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt." });
    }
    const types = DB_TYPES[dbEngine] || DB_TYPES.postgresql;
    const model = "gpt-4o-mini-2024-07-18";

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        entities: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              attributes: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    type: { type: "string", enum: types },
                    isPrimary: { type: "boolean" },
                    isNullable: { type: "boolean" },
                  },
                  required: ["name", "type", "isPrimary", "isNullable"],
                },
              },
            },
            required: ["name", "attributes"],
          },
        },
        relationships: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              type: { type: "string", enum: ["1:1", "1:N", "N:N"] },
              label: { type: "string" },
            },
            required: ["from", "to", "type", "label"],
          },
        },
      },
      required: ["entities", "relationships"],
    };

    const response = await openai.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "You are a data model generator. Return JSON that matches the provided schema. Use only the allowed data types.",
        },
        {
          role: "user",
          content: `Generate a schema based on: ${prompt}. Provide entity and relationship names suitable for the domain.`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "schema_model",
          strict: true,
          schema,
        },
      },
    });

    const outputText = response.output_text?.trim();
    let jsonText = outputText;
    if (!jsonText) {
      const first = response.output?.[0];
      const content = first?.content?.find(
        (item) => item.type === "output_text",
      );
      jsonText = content?.text?.trim();
    }
    if (!jsonText) {
      return res.status(500).json({ error: "AI returned no output." });
    }
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      return res.status(500).json({ error: "AI returned invalid JSON." });
    }
    res.json(parsed);
  } catch (err) {
    console.error("AI generation error:", err);
    res.status(500).json({ error: "AI generation failed." });
  }
});

app.listen(PORT, () => {
  console.log(`Modeler API running on http://localhost:${PORT}`);
});
