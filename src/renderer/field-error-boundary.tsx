// src/renderer/field-error-boundary.tsx
import { Alert } from "@knkcs/anker/primitives";
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
				<Alert
					role="alert"
					status="warning"
					title={`${this.props.fieldName ?? this.props.fieldId}: failed to render`}
				/>
			);
		}

		return this.props.children;
	}
}
