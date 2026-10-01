import { useEffect } from 'react';

import { useAppDispatch } from '@/app/hooks';

import { bootstrapSession } from '../store/sessionThunks';

/** Starts the session bootstrap on mount. The thunk's latch makes it run once per page load. */
export function useSessionBootstrap(): void {
  const dispatch = useAppDispatch();
  useEffect(() => {
    void dispatch(bootstrapSession());
  }, [dispatch]);
}
