"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ChatLangGraphPage;
// app/chat-langgraph/page.tsx
const chat_interface_langgraph_1 = require("@/components/chat-interface-langgraph");
const link_1 = __importDefault(require("next/link"));
const button_1 = require("@/components/ui/button");
const lucide_react_1 = require("lucide-react");
const error_boundary_1 = require("@/components/error-boundary");
function ChatLangGraphPage() {
    return (<error_boundary_1.ErrorBoundary>
      <div className="h-screen flex flex-col">
        <header className="border-b p-4 bg-white flex items-center justify-between">
          <div className="flex items-center gap-4">
            <link_1.default href="/">
              <button_1.Button variant="ghost" size="sm">
                <lucide_react_1.ArrowLeft className="h-4 w-4 mr-2"/>
                Back
              </button_1.Button>
            </link_1.default>
            <div>
              <h1 className="text-xl font-bold">FuelSense 360</h1>
              <p className="text-sm text-muted-foreground">
                LangGraph Implementation
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <link_1.default href="/compare">
              <button_1.Button variant="outline" size="sm">
                Compare Versions
              </button_1.Button>
            </link_1.default>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          <chat_interface_langgraph_1.ChatInterfaceLangGraph />
        </div>
      </div>
    </error_boundary_1.ErrorBoundary>);
}
//# sourceMappingURL=page.js.map