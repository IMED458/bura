import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, Player } from '../types/game';
import { ge } from '../i18n/ge';
import { MessageSquare, Send, VolumeX, Volume2, X } from 'lucide-react';

interface ChatDrawerProps {
  chat: ChatMessage[];
  players: Player[];
  myPlayerId: string;
  onSendMessage: (text: string) => void;
  isOpen: boolean;
  onClose: () => void;
  unreadCount: number;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  chat,
  players,
  myPlayerId,
  onSendMessage,
  isOpen,
  onClose,
  unreadCount,
}) => {
  const [inputText, setInputText] = useState('');
  const [mutedPlayers, setMutedPlayers] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, isOpen]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const toggleMute = (playerId: string) => {
    const next = new Set(mutedPlayers);
    if (next.has(playerId)) {
      next.delete(playerId);
    } else {
      next.add(playerId);
    }
    setMutedPlayers(next);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className={`fixed inset-y-0 right-0 z-50 w-80 bg-slate-900/95 text-slate-100 backdrop-blur-md border-l border-slate-800 shadow-2xl transition-transform duration-300 flex flex-col ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-amber-400" />
          <h3 className="font-bold text-sm text-slate-100">{ge.chatTitle}</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Players List & Mute Controls */}
      <div className="px-3 py-2 bg-slate-950/30 border-b border-slate-800 flex items-center gap-2 overflow-x-auto text-xs">
        {players.map((p) => (
          <div
            key={p.id}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full border ${
              p.id === myPlayerId
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                : 'border-slate-800 bg-slate-900 text-slate-300'
            }`}
          >
            <span className="truncate max-w-[80px] font-medium">{p.name}</span>
            {p.id !== myPlayerId && (
              <button
                onClick={() => toggleMute(p.id)}
                title={mutedPlayers.has(p.id) ? 'ხმის ჩართვა' : 'დადუმება'}
                className="text-slate-400 hover:text-amber-400"
              >
                {mutedPlayers.has(p.id) ? (
                  <VolumeX className="w-3 h-3 text-red-400" />
                ) : (
                  <Volume2 className="w-3 h-3" />
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs">
        {chat.map((msg) => {
          if (mutedPlayers.has(msg.senderId)) return null;

          if (msg.isSystem) {
            return (
              <div
                key={msg.id}
                className="my-1 py-1 px-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300/90 text-center text-[11px] font-medium"
              >
                {msg.text}
              </div>
            );
          }

          const isMe = msg.senderId === myPlayerId;

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-0.5 px-1">
                <span className="font-semibold text-slate-300">{msg.senderName}</span>
                <span>{formatTime(msg.timestamp)}</span>
              </div>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-1.5 break-words ${
                  isMe
                    ? 'bg-amber-500 text-slate-950 font-medium rounded-tr-none'
                    : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={ge.chatPlaceholder}
          maxLength={200}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 p-2 rounded-xl font-bold transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
