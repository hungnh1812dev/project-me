import { useEffect, useMemo, useRef, useState } from 'react';

import type {
  DefinitionValidation,
  DefinitionValidationMode,
  DefinitionValidationRequest,
} from './ContentTypes.api';
import { SCHEMA_VALIDATE_DEBOUNCE_MS } from './ContentTypes.constants';
import { useContentTypesApi } from './ContentTypesApi.context';

export type DefinitionCheckStatus = 'idle' | 'checking' | 'checked' | 'unavailable';

interface Outcome {
  /** Serialized request this outcome answers. */
  requestKey: string;
  failed: boolean;
}

/**
 * Checks a definition with cms-api once it has not changed for the debounce
 * time. The last result stays in `validation` while a newer check runs;
 * `isResultCurrent` is true only when that result answers the current
 * definition. A failed call (network, 5xx, 429, any other status) is
 * `unavailable`; only `retry` sends it again.
 */
export function useDefinitionValidation(definition: object | null, mode: DefinitionValidationMode) {
  const { validateDefinition } = useContentTypesApi();
  const requestKey = useMemo(
    () => (definition === null ? null : JSON.stringify({ definition, mode })),
    [definition, mode],
  );
  const [validation, setValidation] = useState<DefinitionValidation | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const handledRetryCount = useRef(0);

  useEffect(() => {
    if (requestKey === null) return;
    const request = JSON.parse(requestKey) as DefinitionValidationRequest;
    const isRetry = retryCount !== handledRetryCount.current;
    handledRetryCount.current = retryCount;
    let isCancelled = false;
    const send = () => {
      validateDefinition(request).then(
        (result) => {
          if (isCancelled) return;
          setValidation(result);
          setOutcome({ requestKey, failed: false });
        },
        () => {
          if (!isCancelled) setOutcome({ requestKey, failed: true });
        },
      );
    };
    const timer = setTimeout(send, isRetry ? 0 : SCHEMA_VALIDATE_DEBOUNCE_MS);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [requestKey, retryCount, validateDefinition]);

  const hasAnswer = requestKey !== null && outcome?.requestKey === requestKey;
  let status: DefinitionCheckStatus = 'idle';
  if (requestKey !== null) {
    status = !hasAnswer ? 'checking' : outcome.failed ? 'unavailable' : 'checked';
  }

  const retry = () => {
    setOutcome(null);
    setRetryCount((count) => count + 1);
  };

  return {
    status,
    validation,
    isResultCurrent: status === 'checked',
    retry,
  };
}
