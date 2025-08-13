export default function handler(req, res) {
  // 静的なテーブルデータ（本来はデータベースから取得）
  let tables = [
    {
      id: "table-001",
      label: "テーブル1",
      enabled: true
    },
    {
      id: "table-002", 
      label: "テーブル2",
      enabled: true
    }
  ];

  // テーブルIDのカウンター
  let nextId = 3;

  switch (req.method) {
    case 'GET':
      return res.status(200).json(tables);

    case 'POST':
      try {
        const { label } = req.body;
        
        if (!label) {
          return res.status(400).json({ error: 'ラベルは必須です' });
        }

        const newTable = {
          id: `table-${String(nextId).padStart(3, '0')}`,
          label,
          enabled: true
        };

        tables.push(newTable);
        nextId++;
        return res.status(201).json(newTable);
      } catch (error) {
        return res.status(400).json({ error: 'リクエストの処理に失敗しました' });
      }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}
