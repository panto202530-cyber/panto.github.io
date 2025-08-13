export default function handler(req, res) {
  // 静的なイベントデータ（本来はデータベースから取得）
  const events = [
    {
      id: "event-001",
      date: new Date().toISOString().split('T')[0], // 今日の日付
      name: "本日の営業"
    }
  ];

  switch (req.method) {
    case 'GET':
      return res.status(200).json(events);

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}
