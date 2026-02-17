//
//  DateFormatterService.swift
//  CrashlyticsReport
//
//  Created by Mingu Seo on 2/17/26.
//

import Foundation

class DateFormatterService {
    static let shared = DateFormatterService()
    
    /// 크래시 28: DateFormatter 강제 언래핑 — 잘못된 날짜 형식
    func parseServerDate(dateString: String) -> Date {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        return formatter.date(from: dateString)!  // 형식 안 맞으면 크래시
    }
    
    /// 크래시 29: Calendar 계산 강제 언래핑 — 잘못된 컴포넌트
    func getDaysBetween(start: String, end: String) -> Int {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let startDate = formatter.date(from: start)!  // 파싱 실패하면 크래시
        let endDate = formatter.date(from: end)!      // 파싱 실패하면 크래시
        let components = Calendar.current.dateComponents([.day], from: startDate, to: endDate)
        return components.day!
    }
}
