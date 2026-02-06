import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not set.");
}

const client = new MongoClient(uri);
const app = express();
const PORT = process.env.PORT || 3001;
const DB_NAME = process.env.DB_NAME || "modeler";
const COLLECTION = "myModeler-data";

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
    res.status(500).json({ error: "Failed to load model." });
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

app.listen(PORT, () => {
  console.log(`Modeler API running on http://localhost:${PORT}`);
});
