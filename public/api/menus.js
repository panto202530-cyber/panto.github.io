export default function handler(req, res) {
  // GETリクエスト以外は404エラーを返す
  if (req.method !== 'GET') {
    return res.status(404).json({ error: 'Method not allowed' });
  }

  // 静的なメニューデータ
  const menus = [
    {
      id: 1,
      name: "マルゲリータピザ",
      unitPrice: 1200,
      stockLimit: 50,
      category: "ピザ",
      visible: true
    },
    {
      id: 2,
      name: "ペペロンチーノ",
      unitPrice: 980,
      stockLimit: 30,
      category: "パスタ",
      visible: true
    }
  ];

  // JSON形式でメニューデータを返す
  res.status(200).json(menus);
}
