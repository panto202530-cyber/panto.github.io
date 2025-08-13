export default function handler(req, res) {
  // 静的な設定データ（本来はデータベースから取得）
  let settings = {
    alertInitialDelaySec: 600,
    alertRepeatIntervalSec: 300,
    alertMaxRepeats: 3
  };

  switch (req.method) {
    case 'GET':
      return res.status(200).json(settings);

    case 'PATCH':
      try {
        const updates = req.body;
        settings = { ...settings, ...updates };
        return res.status(200).json(settings);
      } catch (error) {
        return res.status(400).json({ error: 'リクエストの処理に失敗しました' });
      }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}
