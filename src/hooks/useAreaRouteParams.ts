import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

/** Area admin routes use the Firestore area document id in the URL (not the display name). */
export function useAreaRouteParams() {
  const { country, area } = useParams<{ country: string; area: string }>();
  const decodedCountry = decodeURIComponent(country || '').trim();
  const areaId = decodeURIComponent(area || '').trim();
  const [areaName, setAreaName] = useState(areaId);

  useEffect(() => {
    if (!decodedCountry || !areaId) return;
    return onSnapshot(doc(db, 'countries', decodedCountry, 'areas', areaId), (snap) => {
      const name = snap.exists() ? String(snap.data()?.name || '').trim() : '';
      setAreaName(name || areaId);
    });
  }, [decodedCountry, areaId]);

  return { country: decodedCountry, areaId, areaName };
}
