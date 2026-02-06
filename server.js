// server.js
import "dotenv/config";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

async function main() {
  await client.connect();
  const db = client.db("test");
  const collection = db.collection("mycollection2");

  const docs = await collection.find({}).limit(10).toArray();
  console.log(docs);

  await client.close();
}

main().catch(console.error);
