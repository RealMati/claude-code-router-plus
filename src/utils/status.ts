import { getServiceInfo } from './processCheck';
import { type SessionConfig, isSessionRunning, getSessionPid, getSessionReferenceCount } from './sessionManager';

export async function showStatus(sessionConfig?: SessionConfig) {
    if (sessionConfig) {
        // Show session-specific status
        const isRunning = await isSessionRunning(sessionConfig);
        const pid = getSessionPid(sessionConfig);
        const refCount = getSessionReferenceCount(sessionConfig);

        console.log('\n📊 Claude Code Router Session Status');
        console.log('═'.repeat(40));
        console.log(`🏷️  Session ID: ${sessionConfig.sessionId}`);
        console.log(`🎯 Model Preference: ${sessionConfig.modelPreference || 'default'}`);

        if (isRunning) {
            console.log('✅ Status: Running');
            console.log(`🆔 Process ID: ${pid}`);
            console.log(`🌐 Port: ${sessionConfig.port}`);
            console.log(`📡 API Endpoint: http://127.0.0.1:${sessionConfig.port}`);
            console.log(`📄 PID File: ${sessionConfig.pidFile}`);
            console.log(`🔢 Reference Count: ${refCount}`);
            console.log('');
            console.log('🚀 Ready to use! Run the following commands:');
            console.log(`   CCR_MODEL_PREFERENCE="${sessionConfig.modelPreference}" ccr code    # Use this session`);
            console.log(`   CCR_MODEL_PREFERENCE="${sessionConfig.modelPreference}" ccr stop   # Stop this session`);
        } else {
            console.log('❌ Status: Not Running');
            console.log('');
            console.log('💡 To start this session:');
            console.log(`   CCR_MODEL_PREFERENCE="${sessionConfig.modelPreference}" ccr start`);
        }
    } else {
        // Show default status
        const info = await getServiceInfo();

        console.log('\n📊 Claude Code Router Status (Default)');
        console.log('═'.repeat(40));

        if (info.running) {
            console.log('✅ Status: Running');
            console.log(`🆔 Process ID: ${info.pid}`);
            console.log(`🌐 Port: ${info.port}`);
            console.log(`📡 API Endpoint: ${info.endpoint}`);
            console.log(`📄 PID File: ${info.pidFile}`);
            console.log('');
            console.log('🚀 Ready to use! Run the following commands:');
            console.log('   ccr code    # Start coding with Claude (default)');
            console.log('   ccr stop   # Stop the service');
        } else {
            console.log('❌ Status: Not Running');
            console.log('');
            console.log('💡 To start the service:');
            console.log('   ccr start');
        }
    }

    console.log('');
}
