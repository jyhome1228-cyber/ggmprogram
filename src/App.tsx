import { useEffect } from 'react';

/**
 * The authenticated order/shipments page is the canonical management screen.
 * The old sample-only React dashboard is intentionally retired so no demo
 * orders are mistaken for real Cafe24 orders.
 */
export default function App() {
  useEffect(() => {
    window.location.replace(import.meta.env.BASE_URL + 'manage.html');
  }, []);
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'Pretendard, sans-serif', color: '#385663' }}>
      <p>건강미 실주문 조회 화면으로 이동합니다…</p>
    </main>
  );
}
