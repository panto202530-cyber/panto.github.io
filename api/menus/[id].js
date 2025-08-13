export default function handler(req, res) {
  // 静的なメニューデータ（本来はデータベースから取得）
  let menus = [
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

  const { id } = req.query;
  const menuId = Number(id);
  const menuIndex = menus.findIndex(m => m.id === menuId);

  if (menuIndex === -1) {
    return res.status(404).json({ error: 'メニューが見つかりません' });
  }

  switch (req.method) {
    case 'GET':
      return res.status(200).json(menus[menuIndex]);

    case 'PATCH':
      try {
        const updates = req.body;
        const updatedMenu = { ...menus[menuIndex], ...updates };
        menus[menuIndex] = updatedMenu;
        return res.status(200).json(updatedMenu);
      } catch (error) {
        return res.status(400).json({ error: 'リクエストの処理に失敗しました' });
      }

    case 'DELETE':
      try {
        // 削除ではなく、非表示にする
        menus[menuIndex].visible = false;
        return res.status(200).json(menus[menuIndex]);
      } catch (error) {
        return res.status(400).json({ error: 'リクエストの処理に失敗しました' });
      }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}
