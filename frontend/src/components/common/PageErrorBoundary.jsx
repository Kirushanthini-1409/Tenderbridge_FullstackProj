import React from 'react';

/** Keeps a rendering failure in one workflow from turning its route into a blank page. */
export default class PageErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`TenderBridge ${this.props.pageName || 'page'} rendering error:`, error, errorInfo);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <section className="panel" role="alert" style={{ margin: '24px auto', maxWidth: 760 }}>
        <p className="eyebrow">TenderBridge</p>
        <h1>{this.props.pageName || 'This page'} could not be displayed</h1>
        <p>The page encountered an unexpected display error. Reload it and try again.</p>
        <details style={{ margin: '16px 0', overflowWrap: 'anywhere' }}>
          <summary>Show error details</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{this.state.error?.stack || this.state.error?.message || String(this.state.error)}</pre>
        </details>
        <button type="button" className="button button-primary" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </section>
    );
  }
}
