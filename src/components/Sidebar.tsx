import React, { useState } from "react";
import {
  PiggyBank,
  ArrowLeftRight,
  DownloadCloud,
  ShieldAlert,
  SendHorizontal,
  UserSquare2,
  LogOut,
  LogIn,
  Sliders,
  Info,
  ChevronRight,
  Menu,
  Pin,
  PinOff,
  History,
  Bot
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
  const [sidebarWidth, setSidebarWidth] = useState(256); // Dynamic width starts at 256px, ranges from 180px to 500px
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    let hasDragged = false;

    setIsDragging(true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      // Constraint limit from 180px minimum up to 500px maximum
      const newWidth = Math.max(180, Math.min(500, startWidth + deltaX));
      
      if (Math.abs(deltaX) > 6) {
        hasDragged = true;
        setSidebarWidth(newWidth);
        setIsPinned(true); // Automatically lock/pin the sidebar when dragging to custom width
      }
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      if (!hasDragged) {
        setIsPinned(prev => !prev);
      }
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };

  const menuItems = isLoggedIn ? [
    { id: "dashboard", label: "Dashboard", icon: Sliders },
    { id: "importar", label: "Importação e Extração", icon: DownloadCloud },
    { id: "visao_geral", label: "Visão Geral Devedores", icon: ArrowLeftRight },
    { id: "cobranca", label: "Cobrança", icon: SendHorizontal },
    { id: "historico", label: "Histórico", icon: History },
    { id: "automacoes", label: "Automações", icon: Bot }
  ] : [
    { id: "inicio", label: "Apresentação", icon: Info }
  ];

  const handleItemClick = (id: string) => {
    onTabChange(id);
  };

  // Determine actual rendered width based on pinned state and hover triggers
  const isExpanded = isPinned || isHovered;

  return (
    <>
      {/* Sleek edge trigger strip to wake up sidebar on hover */}
      <div 
        className="fixed top-0 left-0 h-full w-3 z-50 bg-gradient-to-r from-emerald-500/20 to-transparent cursor-pointer transition-opacity duration-300 md:block hidden"
        onMouseEnter={() => setIsHovered(true)}
      />

      {/* Main Container */}
      <aside
        id="sidebar"
        className={`fixed top-0 left-0 h-full z-40 bg-zinc-950 border-r border-emerald-500/20 text-white flex flex-col justify-between shadow-[4px_0_24px_rgba(0,0,0,0.8)]
          ${isDragging ? "transition-none" : "transition-all duration-300"} 
          ${isPinned ? "translate-x-0" : ""}
        `}
        style={{ width: isExpanded ? `${sidebarWidth}px` : "56px" }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Upper Brand / Logo Segment */}
        <div className="flex flex-col">
          <div className={`flex items-center border-b border-zinc-800/60 overflow-hidden h-[65px] transition-all duration-300
            ${isExpanded ? "justify-between p-4" : "justify-center p-0"}
          `}>
            <div className={`flex items-center ${isExpanded ? "pl-1" : "justify-center w-full"}`}>
              <span className="font-display font-extrabold text-sm uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 via-white to-emerald-400 select-none transition-all duration-300">
                {isExpanded ? "NC Finance" : "NC"}
              </span>
            </div>

            {/* Pin Toggle visible only when expanded */}
            {isExpanded && (
              <button
                onPointerDown={handlePointerDown}
                className="p-1.5 rounded-md text-zinc-400 hover:text-emerald-400 hover:bg-zinc-900 transition-all cursor-grab active:cursor-grabbing border border-transparent hover:border-emerald-500/10"
                title={isPinned ? "Clique para desafixar ou segure e arraste para redimensionar" : "Clique para fixar ou segure e arraste para redimensionar"}
              >
                {isPinned ? <Pin className="w-4 h-4 text-emerald-400" /> : <PinOff className="w-4 h-4" />}
              </button>
            )}
          </div>

          {/* Navigation Items */}
          <nav className="p-2.5 space-y-1.5 flex-1">
            {menuItems.map((item) => {
              const IconComponent = item.icon;
              const isActive = currentTab === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  className={`w-full flex items-center rounded-xl transition-all duration-250 cursor-pointer group relative
                    ${isExpanded ? "justify-start gap-3.5 p-3" : "justify-center px-2 py-3"}
                    ${isActive 
                      ? "bg-emerald-500 text-black font-semibold shadow-[0_3px_15px_rgba(16,185,129,0.25)]" 
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

                  {/* Icon indicator for collapsed state hover */}
                  {!isExpanded && (
                    <div className="absolute left-full ml-3 px-2 py-1 bg-black border border-emerald-500/30 text-emerald-400 text-xs rounded opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-xl">
                      {item.label}
                    </div>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Lower Account Area */}
        <div className={`border-t border-zinc-800/60 flex flex-col gap-1 bg-zinc-950/90 h-[110px] transition-all duration-300
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

      {/* Background Overlay for mobile devices if menu expanded */}
      {isExpanded && !isPinned && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-30 transition-opacity md:hidden"
          onClick={() => setIsHovered(false)}
        />
      )}
    </>
  );
}
