// src/renderer/field-error-boundary.tsx
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
	fieldId: string;
	fieldName?: string;
	onError?: (error: Error, fieldId: string) => void;
	children: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class FieldErrorBoundary extends Component<Props, State> {
	static displayName = "FieldErrorBoundary";

	state: State = { hasError: false, error: null };

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, _info: ErrorInfo) {
		this.props.onError?.(error, this.props.fieldId);
	}

	render() {
		if (this.state.hasError) {
			return (
				<div
					role="alert"
					style={{
						padding: "8px 12px",
						fontSize: "14px",
						color: "var(--chakra-colors-fg-muted)",
						border: "1px solid var(--chakra-colors-border)",
						borderRadius: "6px",
						background: "var(--chakra-colors-bg-subtle)",
					}}
				>
					{this.props.fieldName ?? this.props.fieldId}: failed to render
				</div>
			);
		}

		return this.props.children;
	}
}
