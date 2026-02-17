//
//  SearchService.swift
//  CrashlyticsReport
//
//  Created by Mingu Seo on 2/17/26.
//

import Foundation

class SearchService {
    static let shared = SearchService()
    private var recentSearches: [String] = []
    private var searchResults: [String: [Product]] = [:]
    
    /// 크래시 14: 정규식 강제 생성 — 잘못된 패턴
    func searchWithRegex(pattern: String, in text: String) -> [String] {
        let regex = try! NSRegularExpression(pattern: pattern)  // 잘못된 패턴이면 크래시
        let range = NSRange(text.startIndex..., in: text)
        let matches = regex.matches(in: text, range: range)
        return matches.map { String(text[Range($0.range, in: text)!]) }
    }
    
    /// 크래시 15: 캐시된 검색결과 강제 언래핑 + 인덱스 접근
    func getTopSearchResult(query: String) -> Product {
        let results = searchResults[query]!  // 키 없으면 크래시
        return results[0]                     // 결과 비어있으면 크래시
    }
    
    /// 크래시 16: stride 범위 오류 — 페이지네이션
    func getSearchPage(query: String, page: Int, pageSize: Int) -> [Product] {
        let results = searchResults[query] ?? []
        let start = page * pageSize
        let end = start + pageSize
        return Array(results[start..<end])  // 범위 초과 시 크래시
    }
}
