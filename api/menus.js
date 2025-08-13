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

  // メニューIDのカウンター
  let nextId = 3;

  switch (req.method) {
    case 'GET':
      // クエリパラメータでeventIdが指定されている場合は、そのイベント用のメニューを返す
      const { eventId } = req.query;
      if (eventId) {
        // イベント用のメニュー（現在は全メニューを返す）
        return res.status(200).json(menus);
      }
      // 通常のメニュー一覧を返す
      return res.status(200).json(menus);

    case 'POST':
      try {
        const { name, unitPrice, stockLimit, category, visible, eventId } = req.body;
        
        if (!name || !unitPrice) {
          return res.status(400).json({ error: '名称と単価は必須です' });
        }

        const newMenu = {
          id: nextId++,
          name,
          unitPrice: Number(unitPrice),
          stockLimit: Number(stockLimit) || 0,
          category: category || '',
          visible: visible !== undefined ? visible : true,
          eventId
        };

        menus.push(newMenu);
        return res.status(201).json(newMenu);
      } catch (error) {
        return res.status(400).json({ error: 'リクエストの処理に失敗しました' });
      }

    case 'PATCH':
      try {
        const { id } = req.query;
        const menuId = Number(id);
        const menuIndex = menus.findIndex(m => m.id === menuId);
        
        if (menuIndex === -1) {
          return res.status(404).json({ error: 'メニューが見つかりません' });
        }

        const updates = req.body;
        const updatedMenu = { ...menus[menuIndex], ...updates };
        menus[menuIndex] = updatedMenu;

        return res.status(200).json(updatedMenu);
      } catch (error) {
        return res.status(400).json({ error: 'リクエストの処理に失敗しました' });
      }

    case 'DELETE':
      try {
        const { id } = req.query;
        const menuId = Number(id);
        const menuIndex = menus.findIndex(m => m.id === menuId);
        
        if (menuIndex === -1) {
          return res.status(404).json({ error: 'メニューが見つかりません' });
        }

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
