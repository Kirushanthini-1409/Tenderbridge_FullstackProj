import { explainError } from '../../services/api.js';

export default function OrganizationIntegrationState({ title, description, error, onRetry }) {
  return <div className="org-integration-state" role="status">
    <div>
      <strong>{title}</strong>
      <p>{description}</p>
      <details><summary>Integration details</summary><p>{explainError(error)}</p></details>
    </div>
    {onRetry && <button type="button" className="button button-secondary" onClick={onRetry}>Try again</button>}
  </div>;
}
