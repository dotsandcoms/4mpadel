import React, { Component } from 'react';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-8">
                    <div className="max-w-2xl w-full bg-gray-800 rounded-lg p-8 border border-red-500/50 shadow-2xl">
                        <h1 className="text-2xl font-bold text-red-500 mb-4">Application Error</h1>
                        <p className="text-gray-300 mb-6">
                            Something went wrong in the application. Please see the error details below.
                        </p>

                        <div className="bg-black/50 rounded p-4 font-mono text-xs overflow-auto max-h-64 mb-6 border border-gray-700">
                            <div className="text-red-400 font-bold mb-2">{this.state.error?.toString()}</div>
                            <div className="text-gray-500 whitespace-pre-wrap">
                                {this.state.errorInfo?.componentStack}
                            </div>
                        </div>

                        <button
                            onClick={() => window.location.reload()}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded transition-colors"
                        >
                            Reload Application
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
