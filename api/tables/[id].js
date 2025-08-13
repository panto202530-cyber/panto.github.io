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

  const { id } = req.query;
  const tableIndex = tables.findIndex(t => t.id === id);

  if (tableIndex === -1) {
    return res.status(404).json({ error: 'テーブルが見つかりません' });
  }

  switch (req.method) {
    case 'GET':
      return res.status(200).json(tables[tableIndex]);

    case 'PATCH':
      try {
        const updates = req.body;
        const updatedTable = { ...tables[tableIndex], ...updates };
        tables[tableIndex] = updatedTable;
        return res.status(200).json(updatedTable);
      } catch (error) {
        return res.status(400).json({ error: 'リクエストの処理に失敗しました' });
      }

    case 'DELETE':
      try {
        // テーブルを削除
        const deletedTable = tables.splice(tableIndex, 1)[0];
        return res.status(200).json(deletedTable);
      } catch (error) {
        return res.status(400).json({ error: 'リクエストの処理に失敗しました' });
      }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}
