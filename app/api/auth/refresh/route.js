// import { refreshSession } from '@/lib/auth'
// import { NextResponse } from 'next/server'

// export async function POST() {
//   try {
//     const newToken = await refreshSession()
    
//     if (!newToken) {
//       return NextResponse.json(
//         { error: 'Session refresh failed' },
//         { status: 401 }
//       )
//     }

//     return NextResponse.json({ 
//       success: true,
//       message: 'Session refreshed' 
//     })
//   } catch (error) {
//     console.error('Refresh error:', error)
//     return NextResponse.json(
//       { error: 'Failed to refresh session' },
//       { status: 500 }
//     )
//   }
// }