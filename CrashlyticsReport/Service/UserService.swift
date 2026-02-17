//
//  UserService.swift
//  CrashlyticsReport
//
//  Created by Mingu Seo on 2/17/26.
//

class UserService {
    static let shared = UserService()
    private var currentUser: User?
    private var cachedUsers: [String: User] = [:]
    
    /// 크래시 1: Optional 강제 언래핑 — 로그인 전 사용자 접근
    func getCurrentUserName() -> String {
        return currentUser!.name  // currentUser가 nil이면 크래시
    }
    
    /// 크래시 2: 옵셔널 체이닝 없이 중첩 접근
    func getFirstFriendEmail() -> String {
        let friends = currentUser!.friends!  // 이중 강제 언래핑
        return friends[0].email!             // 삼중 강제 언래핑 + 인덱스 접근
    }
    
    /// 크래시 3: Dictionary 강제 언래핑
    func getCachedUser(id: String) -> User {
        return cachedUsers[id]!  // 키가 없으면 크래시
    }
}
