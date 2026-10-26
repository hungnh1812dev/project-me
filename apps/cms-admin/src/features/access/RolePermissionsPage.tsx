import { Button, FormAlert, type FormAlertTone } from '@abyss/form-commons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { COPY } from '../../config/Copy.constants';
import { API_ERROR_CODES, HTTP_STATUS } from '../../config/Http.constants';
import { APP_ROUTES } from '../../config/App.routes';
import type { ContentType } from '../content-types';
import type { Role } from './access.api';
import { useAccessApi } from './access-api-context';
import { toAccessError } from './access-error';
import {
  ACCESS_QUERY_KEYS,
  useContentTypesQuery,
  useRolesQuery,
} from './access-queries';
import { useCallerAccess } from './caller-access';
import {
  LoadError,
  PageHeader,
  TableSkeleton,
} from '../../components/PageStates';
import { PermissionMatrix } from './PermissionMatrix';
import {
  cellIssues,
  cellKey,
  cellsAt,
  matrixFromRows,
  type MatrixState,
  sameMatrix,
  serializeMatrix,
  subjectOrder,
} from './permission-matrix';
import { OWNER_ROLE_SLUG } from './access.constants';

const copy = COPY.access;

/** `/roles/:roleId`: one role's permission matrix. */
export function RolePermissionsPage() {
  const { roleId } = useParams();
  const roles = useRolesQuery();
  const contentTypes = useContentTypesQuery();

  const header = (
    <Button asChild variant="link" className="h-auto justify-self-start px-0">
      <Link to={APP_ROUTES.ROLES}>{copy.role.back}</Link>
    </Button>
  );

  if (roles.isPending || contentTypes.isPending) {
    return (
      <div className="grid gap-6">
        {header}
        <TableSkeleton label={copy.roles.loading} />
      </div>
    );
  }
  if (roles.isError || contentTypes.isError) {
    const failedRoles = roles.isError;
    return (
      <div className="grid gap-6">
        {header}
        <LoadError
          message={
            failedRoles
              ? toAccessError(roles.error).status === HTTP_STATUS.FORBIDDEN
                ? copy.roles.forbidden
                : copy.roles.loadFailed
              : copy.role.contentTypesFailed
          }
          isRetrying={roles.isFetching || contentTypes.isFetching}
          onRetry={() => {
            if (failedRoles) void roles.refetch();
            else void contentTypes.refetch();
          }}
        />
      </div>
    );
  }

  const role = roles.data.find((item) => item.id === roleId);
  if (role === undefined) {
    return (
      <div className="grid gap-6">
        {header}
        <FormAlert tone="info">{copy.role.notFound}</FormAlert>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {header}
      <PageHeader
        title={role.name}
        description={copy.role.meta(role.slug, role.rank, role.accountCount)}
      />
      {role.slug === OWNER_ROLE_SLUG ? (
        <FormAlert tone="info">{copy.role.owner}</FormAlert>
      ) : (
        <RoleEditor
          key={role.id}
          role={role}
          contentTypes={contentTypes.data}
        />
      )}
    </div>
  );
}

interface SaveFeedback {
  tone: FormAlertTone;
  message: string;
}

function RoleEditor({
  role,
  contentTypes,
}: {
  role: Role;
  contentTypes: readonly ContentType[];
}) {
  const api = useAccessApi();
  const queryClient = useQueryClient();
  const caller = useCallerAccess();
  const [baseline, setBaseline] = useState(() =>
    matrixFromRows(role.permissions),
  );
  const [matrix, setMatrix] = useState<MatrixState>(baseline);
  const [feedback, setFeedback] = useState<SaveFeedback | null>(null);
  const [errors, setErrors] = useState<ReadonlyMap<string, string[]>>(
    new Map(),
  );
  const [notHeld, setNotHeld] = useState<ReadonlySet<string>>(new Set());
  const [checkJson, setCheckJson] = useState(false);

  const editable = role.manageable && caller.can('roles', 'update');
  const order = subjectOrder(
    matrix,
    contentTypes.map((type) => type.slug),
  );
  const flatOrder = [...order.content, ...order.system];
  const serialized = serializeMatrix(matrix, flatOrder);
  const dirty = !sameMatrix(matrix, baseline, flatOrder);
  const invalidConditions = new Set(
    checkJson ? serialized.invalidConditions.map(cellKey) : [],
  );

  const save = useMutation({
    mutationFn: (sent: typeof serialized) =>
      api.replacePermissions(role.id, sent.rows),
    onSuccess: (saved) => {
      queryClient.setQueryData<Role[]>(ACCESS_QUERY_KEYS.roles, (current) =>
        current?.map((item) => (item.id === saved.id ? saved : item)),
      );
      const next = matrixFromRows(saved.permissions);
      setBaseline(next);
      setMatrix(next);
      setErrors(new Map());
      setNotHeld(new Set());
      setCheckJson(false);
      setFeedback({ tone: 'success', message: copy.role.saved });
    },
    onError: (cause, sent) => {
      const error = toAccessError(cause);
      setErrors(cellIssues(error.issues, sent.cells));
      setNotHeld(cellsAt(error.indexes, sent.cells));
      const invalid =
        error.status === HTTP_STATUS.BAD_REQUEST &&
        error.errorCode !== undefined;
      setFeedback({
        tone: error.tone,
        message: invalid ? copy.role.invalid : error.message,
      });
      if (
        error.errorCode === API_ERROR_CODES.ACCESS_RANK_FORBIDDEN ||
        error.errorCode === API_ERROR_CODES.ROLE_NOT_FOUND
      ) {
        void queryClient.invalidateQueries({
          queryKey: ACCESS_QUERY_KEYS.roles,
        });
      }
    },
  });

  const onSave = () => {
    setCheckJson(true);
    if (serialized.invalidConditions.length > 0) {
      setFeedback({ tone: 'error', message: copy.role.conditionsInvalidJson });
      return;
    }
    setFeedback(null);
    save.mutate(serialized);
  };

  return (
    <div className="grid gap-6">
      {editable ? null : (
        <FormAlert tone="info">
          {role.manageable ? copy.role.readOnlyNoUpdate : copy.role.readOnly}
        </FormAlert>
      )}
      {feedback === null ? null : (
        <FormAlert tone={feedback.tone}>{feedback.message}</FormAlert>
      )}
      <PermissionMatrix
        state={matrix}
        onChange={(update) => {
          setMatrix(update);
          if (feedback?.tone === 'success') setFeedback(null);
        }}
        contentTypes={contentTypes}
        order={order}
        editable={editable && !save.isPending}
        canGrant={(subject, action) =>
          caller.isOwner || caller.can(subject, action)
        }
        errors={errors}
        notHeld={notHeld}
        invalidConditions={invalidConditions}
      />
      {editable ? (
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t border-border bg-card px-4 py-3 sm:-mx-6 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          {dirty ? (
            <p className="m-0 text-sm text-muted-foreground sm:mr-auto">
              {copy.role.unsaved}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              disabled={!dirty || save.isPending}
              onClick={() => {
                setMatrix(baseline);
                setErrors(new Map());
                setNotHeld(new Set());
                setCheckJson(false);
                setFeedback(null);
              }}
            >
              {copy.role.discard}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!dirty}
              loading={save.isPending}
              onClick={onSave}
            >
              {copy.role.save}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
