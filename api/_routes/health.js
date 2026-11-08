export default async function handler(req, res) {
  return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}
