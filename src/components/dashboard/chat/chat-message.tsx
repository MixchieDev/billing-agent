'use client';

import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === 'user';

  // Format content with basic markdown support
  const formatContent = (text: string) => {
    // Split by newlines and process each line
    const lines = text.split('\n');

    return lines.map((line, i) => {
      // Handle numbered lists
      const numberedMatch = line.match(/^(\d+)\.\s+(.+)/);
      if (numberedMatch) {
        return (
          <div key={i} className="flex gap-2 ml-2">
            <span className="text-gray-500 min-w-[20px]">{numberedMatch[1]}.</span>
            <span>{formatInlineStyles(numberedMatch[2])}</span>
          </div>
        );
      }

      // Handle bullet points
      const bulletMatch = line.match(/^[-*]\s+(.+)/);
      if (bulletMatch) {
        return (
          <div key={i} className="flex gap-2 ml-2">
            <span className="text-gray-500">•</span>
            <span>{formatInlineStyles(bulletMatch[1])}</span>
          </div>
        );
      }

      // Handle empty lines
      if (line.trim() === '') {
        return <div key={i} className="h-2" />;
      }

      // Regular text
      return (
        <p key={i} className="mb-1">
          {formatInlineStyles(line)}
        </p>
      );
    });
  };

  // Format inline styles (bold, italic)
  const formatInlineStyles = (text: string) => {
    // Bold text **text**
    const parts = text.split(/(\*\*[^*]+\*\*)/g);

    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div
      className={cn(
        'flex gap-3 p-3 rounded-lg',
        isUser ? 'bg-blue-50 ml-8' : 'bg-gray-50 mr-8'
      )}
    >
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser ? 'bg-blue-500' : 'bg-gray-700'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>
      <div className="flex-1 min-w-0 text-sm leading-relaxed">
        {formatContent(content)}
      </div>
    </div>
  );
}

export function ChatMessageLoading() {
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-gray-50 mr-8">
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gray-700">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 flex items-center gap-1">
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}
