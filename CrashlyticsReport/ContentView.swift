//
//  ContentView.swift
//  CrashlyticsReport
//
//  Created by Mingu Seo on 2/12/26.
//

import SwiftUI
import FirebaseCrashlytics

struct ContentView: View {
    let error = NSError()
    let array = ["a", "b", "c"]
    var body: some View {
        VStack {
            Button("CrashCustomError") {
                Crashlytics.crashlytics().record(error: error)
            }
            
            Button("FatalCrash") {
              fatalError("Crash was triggered")
            }
            
            Button("IndexCrash") {
              print(array[4])
            }
            
            Button("FatalErrorCrash") {
              fatalError("Crash was triggered")
            }
        }
        .padding(10)
        
    }
}

#Preview {
    ContentView()
}
