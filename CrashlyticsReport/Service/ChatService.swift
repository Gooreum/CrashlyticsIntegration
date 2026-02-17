//
//  ChatService.swift
//  CrashlyticsReport
//
//  Created by Mingu Seo on 2/17/26.
//

import Foundation

class ChatService {
    static let shared = ChatService()
    private var messages: [ChatMessage] = []
    private var typingUsers: [String] = []
    
    /// 크래시 11: 빈 배열 last 강제 언래핑
    func getLastMessage() -> ChatMessage {
        return messages.last!  // 메시지가 없으면 크래시
    }
    
    /// 크래시 12: String 인덱싱 범위 초과 — 메시지 미리보기 자르기
    func getMessagePreview(messageId: String) -> String {
        let message = messages.first { $0.id == messageId }!
        let text = message.text!
        let index = text.index(text.startIndex, offsetBy: 50)  // 50자 미만이면 크래시
        return String(text[..<index])
    }
    
    /// 크래시 13: 배열 removeAt 범위 초과
    func removeTypingUser(at index: Int) {
        typingUsers.remove(at: index)  // 인덱스가 범위 밖이면 크래시
    }
}
