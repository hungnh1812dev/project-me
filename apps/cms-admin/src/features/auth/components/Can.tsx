import { useCan } from '../hooks/useCan';
import { usePermissionDecision } from '../hooks/usePermission';
import type { PermissionMode } from '../permissions/can';
import type { Decision, PolicyAttrs } from '../permissions/policies';

interface BaseProps {
  /** Rendered when allowed. A render function is always called with the decision instead. */
  children?: React.ReactNode | ((decision: Decision) => React.ReactNode);
  /** Rendered when denied (not with a render function). Defaults to `null`. */
  fallback?: React.ReactNode;
}

/** ABAC: `<Can I="delete" a="user" with={{ targetUserId, targetLevel }}>`. */
interface PolicyProps extends BaseProps {
  I: string;
  a: string;
  with?: PolicyAttrs;
  permission?: never;
  mode?: never;
  contentTypeSlug?: never;
}

/** RBAC: `<Can permission={['role:read', 'user:read']} mode="any">`. */
interface PermissionProps extends BaseProps {
  permission: string | readonly string[];
  mode?: PermissionMode;
  contentTypeSlug?: string;
  I?: never;
  a?: never;
  with?: never;
}

export type CanProps = PolicyProps | PermissionProps;

const NO_SLUGS: readonly string[] = [];

/** Renders `children` when the signed-in user is allowed, else `fallback`. */
const Can: React.FC<CanProps> = (props) => {
  const { children, fallback = null } = props;
  const policyDecision = useCan(props.I ?? '', props.a ?? '', props.with);
  const permissionDecision = usePermissionDecision(props.permission ?? NO_SLUGS, {
    mode: props.mode,
    contentTypeSlug: props.contentTypeSlug,
  });
  const decision = props.permission === undefined ? policyDecision : permissionDecision;

  if (typeof children === 'function') return children(decision);
  return decision.allowed ? children : fallback;
};
Can.displayName = 'Can';

export default Can;
