import React, { useState } from "react";
import {
  LogOut,
  LogIn,
  Info,
  History,
  SendHorizontal,
  LayoutDashboard,
  Upload,
  Eye,
  MessageSquare,
  Zap,
} from "lucide-react";

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  isLoggedIn: boolean;
  onLogout: () => void;
  onLoginClick: () => void;
  userLabel?: string;
  userEmail?: string;
}

export default function Sidebar({
  currentTab,
  onTabChange,
  isLoggedIn,
  onLogout,
  onLoginClick,
  userLabel = "Conta autenticada",
  userEmail = ""
}: SidebarProps) {
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // ── Menu definition ────────────────────────────────────────────────────────
  // "cobrar" = fluxo simplificado para o cliente (Upload → Prévia → Envio)
  // Demais tabs = pipeline operacional interno completo
  const menuItems = isLoggedIn ? [
    { id: "cobrar",      label: "Cobrar",       icon: SendHorizontal, section: "client" },
    { id: "separator1",  label: "",             icon: null,            section: "divider" },
    { id: "dashboard",   label: "Dashboard",    icon: LayoutDashboard, section: "internal" },
    { id: "importar",    label: "Importar",     icon: Upload,          section: "internal" },
    { id: "visao_geral", label: "Visão Geral",  icon: Eye,             section: "internal" },
    { id: "cobranca",    label: "Cobrança",     icon: MessageSquare,   section: "internal" },
    { id: "historico",   label: "Histórico",    icon: History,         section: "internal" },
    { id: "automacoes",  label: "Automações",   icon: Zap,             section: "internal" },
  ] : [
    { id: "inicio", label: "Apresentação", icon: Info, section: "public" }
  ];

  const handleItemClick = (id: string) => {
    if (id.startsWith("separator")) return;
    onTabChange(id);
  };

  const isExpanded = isPinned || isHovered;

  return (
    <>
      {/* Edge hover trigger */}
      <div
        className="fixed top-0 left-0 h-full w-3 z-50 bg-gradient-to-r from-emerald-500/20 to-transparent cursor-pointer transition-opacity duration-300 md:block hidden"
        onMouseEnter={() => setIsHovered(true)}
      />

      {/* Main Container */}
      <aside
        id="sidebar"
        className={`fixed top-0 left-0 h-full z-40 bg-zinc-950 border-r border-emerald-500/20 text-white flex flex-col justify-between shadow-[4px_0_24px_rgba(0,0,0,0.8)] transition-all duration-300`}
        style={{ width: isExpanded ? "240px" : "56px" }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Brand */}
        <div className="flex flex-col min-h-0 overflow-y-auto">
          <div className={`flex items-center border-b border-zinc-800/60 overflow-hidden h-[65px] transition-all duration-300 flex-shrink-0
            ${isExpanded ? "justify-between p-4" : "justify-center p-0"}
          `}>
            <div className={`flex items-center ${isExpanded ? "pl-1" : "justify-center w-full"}`}>
              <span className="font-display font-extrabold text-sm uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 via-white to-emerald-400 select-none transition-all duration-300">
                {isExpanded ? "NC Finance" : "NC"}
              </span>
            </div>

            {isExpanded && (
              <button
                onClick={() => setIsPinned(prev => !prev)}
                className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-all"
                title={isPinned ? "Desafixar sidebar" : "Fixar sidebar"}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isPinned
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  }
                </svg>
              </button>
            )}
          </div>

          {/* Navigation */}
          <nav className="p-2.5 space-y-1 flex-1">
            {menuItems.map((item) => {
              // Divider
              if (item.section === "divider") {
                return (
                  <div key={item.id} className={`transition-all duration-200 ${isExpanded ? "mx-1 my-2 border-t border-zinc-800/60" : "mx-2 my-2 border-t border-zinc-800/60"}`} />
                );
              }

              const IconComponent = item.icon!;
              const isActive = currentTab === item.id;
              const isClient = item.section === "client";

              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  className={`w-full flex items-center rounded-xl transition-all duration-250 cursor-pointer group relative
                    ${isExpanded ? "justify-start gap-3.5 p-3" : "justify-center px-2 py-3"}
                    ${isActive
                      ? isClient
                        ? "bg-emerald-500 text-black font-semibold shadow-[0_3px_15px_rgba(16,185,129,0.25)]"
                        : "bg-zinc-800 text-white font-semibold"
                      : isClient
                        ? "text-emerald-400 hover:text-black hover:bg-emerald-500/80"
                        : "text-zinc-400 hover:text-white hover:bg-zinc-900/80"
                    }
                  `}
                >
                  <div className="flex items-center justify-center w-5 h-5 flex-shrink-0">
                    <IconComponent className={`w-5 h-5 flex-shrink-0 transition-transform ${!isActive && "group-hover:scale-110"}`} />
                  </div>

                  {isExpanded && (
                    <span className="text-sm transition-all duration-200 truncate opacity-100">
                      {item.label}
                    </span>
                  )}

                  {!isExpanded && (
                    <div className="absolute left-full ml-3 px-2 py-1 bg-black border border-emerald-500/30 text-emerald-400 text-xs rounded opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-xl">
                      {item.label}
                    </div>
                  )}
                </button>
              );
            })}

            {/* Internal section label */}
          </nav>
        </div>

        {/* Account area */}
        <div className={`border-t border-zinc-800/60 flex flex-col gap-1 bg-zinc-950/90 flex-shrink-0 transition-all duration-300
          ${isExpanded ? "p-3" : "p-2.5 py-3"}
        `}>
          {isLoggedIn ? (
            <div className="flex flex-col gap-1.5 overflow-hidden">
              {isExpanded && (
                <div className="px-2.5 py-1 text-xs text-zinc-500 max-w-full truncate">
                  Conta autenticada:
                  <span className="text-zinc-200 block truncate font-semibold">{userLabel}</span>
                  {userEmail ? <span className="text-zinc-400 font-mono block truncate">{userEmail}</span> : null}
                </div>
              )}
              <button
                onClick={onLogout}
                className={`w-full flex items-center rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all truncate cursor-pointer
                  ${isExpanded ? "justify-start gap-3.5 p-2" : "justify-center p-2"}
                `}
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                {isExpanded && (
                  <span className="text-xs opacity-100 transition-opacity duration-200">
                    Desconectar
                  </span>
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={onLoginClick}
              className={`w-full flex items-center rounded-lg text-emerald-400 hover:text-black hover:bg-emerald-500 transition-all cursor-pointer
                ${isExpanded ? "justify-start gap-3.5 p-2.5" : "justify-center p-1.5 py-2.5"}
              `}
            >
              <LogIn className="w-4 h-4 flex-shrink-0" />
              {isExpanded && (
                <span className="text-xs font-semibold opacity-100 transition-opacity duration-200">
                  Acesso Interno
                </span>
              )}
            </button>
          )}
        </div>
      </aside>

      {/* Mobile overlay */}
      {isExpanded && !isPinned && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-30 transition-opacity md:hidden"
          onClick={() => setIsHovered(false)}
        />
      )}
    </>
  );
}
