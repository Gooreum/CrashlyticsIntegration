//
//  AppView2.swift
//  CrashlyticsReport
//
//  Created by Mingu Seo on 2/12/26.
//

//
//  AppView.swift
//  CrashlyticsReport
//
//  Created by Mingu Seo on 2/12/26.
//



import SwiftUI
import FirebaseCrashlytics

struct AppView2: View {
    let error = NSError()
    let array = ["a", "b", "c"]
    
    
    
    var body: some View {
        VStack {
            
            
           
            Button("FatalCrash") {
              fatalError("Crash was triggered")
            }
            
            Button("FatalErrorCrash") {
              fatalError("Crash was triggered")
            }
            
            Button("IndexCrash") {
              print(array[4])
            }
            
            
            Button("IndexCrash2") {
              print(array[4])
            }
            
            
            Button("IndexCrash3") {
              print(array[4])
            }
            
            
            Button("CrashCustomError") {
                Crashlytics.crashlytics().record(error: error)
            }
            
            
            
        }
        .padding(10)
        
    }
}

#Preview {
    ContentView()
}
